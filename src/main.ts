import "./style.css";
import { NOTE_NAMES } from "./audio/frequencies";
import { playPattern } from "./audio/transmitter";
import { measure, startReceiving, type ReceiverHandle } from "./audio/receiver";
import { ALPHABET, activeNotes, charToIndex, indexToPattern, type Character } from "./protocol/alphabet";
import { StreamDecoder } from "./protocol/decoder";

const SEND_DURATION_SECONDS = 1;

const app = document.querySelector<HTMLDivElement>("#app")!;

const freqBoxesHtml = () =>
  NOTE_NAMES.map((name) => `<div class="freq-box" data-note="${name}">${name}</div>`).join("");

app.innerHTML = `
  <div>
    <h1>SignalChord</h1>

    <div id="mode-select">
      <p>「送る」または「受けとる」を選んでください</p>
      <button id="mode-tx">送る</button>
      <button id="mode-rx">受けとる</button>
    </div>

    <div id="tx-section" hidden>
      <button class="back-button" data-mode="select">← 戻る</button>
      <p>送りたい文字を選んで「送る」を押してください</p>
      <select id="char-select">
        ${ALPHABET.map((char) => {
          const pattern = indexToPattern(charToIndex(char));
          const hint = activeNotes(pattern).join("+");
          const label = char === " " ? "(スペース)" : char;
          return `<option value="${char}">${label} — ${hint}</option>`;
        }).join("")}
      </select>
      <div class="freq-display">${freqBoxesHtml()}</div>
      <button id="send">送る</button>

      <hr />
      <div class="text-send">
        <p>複数文字をまとめてタイプして送ることもできます（使える文字: ひらがな46音・句読点「、。」・「!」「?」・半角スペース）</p>
        <input type="text" id="text-input" placeholder="こんにちは" />
        <button id="send-text">まとめて送る</button>
        <p id="text-send-status"></p>
      </div>

      <details class="loss-controls">
        <summary>発展: 周波数を届かなくする</summary>
        <p>チェックした周波数は実際には送信されません（電波状況が悪い状況のシミュレーション）。</p>
        ${NOTE_NAMES.map(
          (name) => `
          <label>
            <input type="checkbox" name="lost" value="${name}" />
            ${name}
          </label>`,
        ).join("")}
      </details>
    </div>

    <div id="rx-section" hidden>
      <button class="back-button" data-mode="select">← 戻る</button>
      <p>マイクで音を受け取ります</p>
      <button id="mic-start">マイク開始</button>
      <button id="mic-stop" disabled>停止</button>
      <div class="freq-display">${freqBoxesHtml()}</div>
      <p id="rx-current-char" class="current-char">―</p>
      <p>受信履歴: <span id="rx-history"></span></p>
      <details>
        <summary>デバッグ情報</summary>
        <pre id="rx-debug"></pre>
      </details>
    </div>

    <hr />
    <section class="explanation">
      <h2>仕組みについて</h2>
      <p>
        C5・D5・E5・G5・A5・C6という6つの高さの音は、それぞれ別々の情報の通り道（チャンネル）です。
        複数の音を同時に鳴らすことで、一度に複数の情報を送っています。
      </p>
      <p>
        受信側はマイクで拾った音をFFT（周波数解析）で6つの音に分解し、どの音が鳴っていたかを
        調べることで元の文字を復元しています。
      </p>
      <p>
        この仕組みは、5GやWi-Fiなどの通信で使われているOFDMという技術の考え方につながっています
        （実際の通信ではもっと多くの周波数を使い、振幅や位相も変化させて情報を送っています）。
      </p>
    </section>
  </div>
`;

// --- 送信側 ---

const txSection = document.getElementById("tx-section")!;
const select = document.getElementById("char-select") as HTMLSelectElement;
const txFreqBoxes = Array.from(txSection.querySelectorAll<HTMLDivElement>(".freq-box"));
const lossCheckboxes = Array.from(
  txSection.querySelectorAll<HTMLInputElement>('input[name="lost"]'),
);

function currentPattern() {
  return indexToPattern(charToIndex(select.value as Character));
}

// 「届かなくする」がチェックされた周波数を除いた、実際に送信されるパターン。
function effectivePatternFor(char: Character): ReturnType<typeof currentPattern> {
  const intended = indexToPattern(charToIndex(char));
  return intended.map((on, i) => on && !lossCheckboxes[i].checked) as unknown as typeof intended;
}

function effectivePattern(): ReturnType<typeof currentPattern> {
  return effectivePatternFor(select.value as Character);
}

function updateSelectedHighlight(): void {
  const effective = effectivePattern();
  txFreqBoxes.forEach((box, i) => {
    box.classList.toggle("selected", effective[i]);
    box.classList.toggle("lost", lossCheckboxes[i].checked);
  });
}

select.addEventListener("change", updateSelectedHighlight);
lossCheckboxes.forEach((checkbox) => checkbox.addEventListener("change", updateSelectedHighlight));
updateSelectedHighlight();

let txAudioContext: AudioContext | null = null;
let txSending = false;

const sendButton = document.getElementById("send") as HTMLButtonElement;
const sendTextButton = document.getElementById("send-text") as HTMLButtonElement;
const textInput = document.getElementById("text-input") as HTMLInputElement;
const textSendStatus = document.getElementById("text-send-status")!;

function setTxSending(sending: boolean): void {
  txSending = sending;
  sendButton.disabled = sending;
  sendTextButton.disabled = sending;
}

sendButton.addEventListener("click", () => {
  if (txSending) return;
  txAudioContext ??= new AudioContext();
  if (txAudioContext.state === "suspended") {
    void txAudioContext.resume();
  }

  const pattern = effectivePattern();
  playPattern(txAudioContext, pattern, SEND_DURATION_SECONDS);

  setTxSending(true);
  txFreqBoxes.forEach((box, i) => box.classList.toggle("playing", pattern[i]));
  setTimeout(() => {
    txFreqBoxes.forEach((box) => box.classList.remove("playing"));
    setTxSending(false);
  }, SEND_DURATION_SECONDS * 1000);
});

// 入力文字列のうち、ALPHABETに含まれる文字（ひらがな46音+句読点等）だけを送信対象として取り出す。
function sanitizeText(input: string): Character[] {
  return Array.from(input).filter((ch): ch is Character =>
    (ALPHABET as readonly string[]).includes(ch),
  );
}

const GAP_SECONDS = 0.4; // 文字間の無音。受信側が無音として認識するのに十分な長さ(Findings.md参照)。

sendTextButton.addEventListener("click", () => {
  if (txSending) return;
  const chars = sanitizeText(textInput.value);
  if (chars.length === 0) return;

  txAudioContext ??= new AudioContext();
  if (txAudioContext.state === "suspended") {
    void txAudioContext.resume();
  }
  const audioContext = txAudioContext;

  setTxSending(true);
  textSendStatus.textContent = `送信内容: "${chars.join("")}"`;

  const stepSeconds = SEND_DURATION_SECONDS + GAP_SECONDS;
  const leadIn = 0.1;
  const baseTime = audioContext.currentTime + leadIn;

  chars.forEach((char, i) => {
    const pattern = effectivePatternFor(char);
    const startTime = baseTime + i * stepSeconds;
    playPattern(audioContext, pattern, SEND_DURATION_SECONDS, startTime);

    const startDelayMs = (startTime - audioContext.currentTime) * 1000;
    setTimeout(() => {
      txFreqBoxes.forEach((box, j) => box.classList.toggle("playing", pattern[j]));
      textSendStatus.textContent = `送信中: "${char}" (${i + 1}/${chars.length})`;
    }, startDelayMs);
    setTimeout(
      () => {
        txFreqBoxes.forEach((box) => box.classList.remove("playing"));
      },
      startDelayMs + SEND_DURATION_SECONDS * 1000,
    );
  });

  const totalDelayMs = (baseTime - audioContext.currentTime + chars.length * stepSeconds) * 1000;
  setTimeout(() => {
    textSendStatus.textContent = `送信完了: "${chars.join("")}"`;
    setTxSending(false);
  }, totalDelayMs);
});

// --- 受信側 ---

const rxSection = document.getElementById("rx-section")!;
const rxFreqBoxes = Array.from(rxSection.querySelectorAll<HTMLDivElement>(".freq-box"));
const rxCurrentChar = document.getElementById("rx-current-char")!;
const rxHistory = document.getElementById("rx-history")!;
const rxDebug = document.getElementById("rx-debug")!;
const micStartButton = document.getElementById("mic-start") as HTMLButtonElement;
const micStopButton = document.getElementById("mic-stop") as HTMLButtonElement;

let rxAudioContext: AudioContext | null = null;
let receiverHandle: ReceiverHandle | null = null;
let rafId: number | null = null;
let historyText = "";

function stopReceiving(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  receiverHandle?.stop();
  receiverHandle = null;
  micStartButton.disabled = false;
  micStopButton.disabled = true;
  rxFreqBoxes.forEach((box) => box.classList.remove("playing"));
  rxCurrentChar.textContent = "―";
}

micStartButton.addEventListener("click", () => {
  void (async () => {
    rxAudioContext ??= new AudioContext();
    if (rxAudioContext.state === "suspended") {
      await rxAudioContext.resume();
    }
    receiverHandle = await startReceiving(rxAudioContext);
    micStartButton.disabled = true;
    micStopButton.disabled = false;

    const decoder = new StreamDecoder();

    const loop = () => {
      if (!receiverHandle || !rxAudioContext) return;
      const { levelsDb, pattern } = measure(receiverHandle.analyser, rxAudioContext.sampleRate);
      rxFreqBoxes.forEach((box, i) => box.classList.toggle("playing", pattern[i]));

      const acceptedChar = decoder.push(pattern);
      if (acceptedChar !== undefined) {
        historyText += acceptedChar;
        rxHistory.textContent = historyText;
      }
      rxCurrentChar.textContent = decoder.currentChar ?? "―";

      rxDebug.textContent = NOTE_NAMES.map(
        (name, i) => `${name}: ${pattern[i] ? "ON " : "off"} (${levelsDb[i].toFixed(1)} dB)`,
      ).join("\n");
      rafId = requestAnimationFrame(loop);
    };
    loop();
  })();
});

micStopButton.addEventListener("click", stopReceiving);

// --- モード切り替え ---
// 受信モードから離れるときは、バックグラウンドでマイクを掴んだままにしないよう必ず停止する。

type Mode = "select" | "tx" | "rx";

const modeSections: Record<Mode, HTMLElement> = {
  select: document.getElementById("mode-select")!,
  tx: txSection,
  rx: rxSection,
};

function setMode(mode: Mode): void {
  if (mode !== "rx") {
    stopReceiving();
  }
  for (const [key, section] of Object.entries(modeSections)) {
    section.hidden = key !== mode;
  }
}

document.getElementById("mode-tx")!.addEventListener("click", () => setMode("tx"));
document.getElementById("mode-rx")!.addEventListener("click", () => setMode("rx"));
document.querySelectorAll<HTMLButtonElement>(".back-button").forEach((button) => {
  button.addEventListener("click", () => setMode("select"));
});

setMode("select");
