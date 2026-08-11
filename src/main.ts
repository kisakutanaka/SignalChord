import "./style.css";
import { NOTE_NAMES } from "./audio/frequencies";
import { playPattern, type AmplitudePattern } from "./audio/transmitter";
import { measure, startReceiving, type ReceiverHandle } from "./audio/receiver";
import {
  ALPHABET,
  charToIndex,
  indexToPattern,
  PILOT_PATTERN,
  type Character,
} from "./protocol/alphabet";
import { ProtocolDecoder, SILENCE_THRESHOLD_DB } from "./protocol/decoder";

// 1記号あたりの再生時間と、記号間の無音時間。1文字は「パイロット→記号A→記号B(確認)」の
// 3記号で構成される(STEP_SECONDS×3)。
const SYMBOL_DURATION_SECONDS = 0.5;
const GAP_SECONDS = 0.3;
const STEP_SECONDS = SYMBOL_DURATION_SECONDS + GAP_SECONDS;
const CHAR_TOTAL_SECONDS = STEP_SECONDS * 3;

const app = document.querySelector<HTMLDivElement>("#app")!;

const freqBoxesHtml = () =>
  NOTE_NAMES.map((name) => `<div class="freq-box" data-note="${name}">${name}</div>`).join("");

// 各チャンネルの振幅段階を「強:C5+D5 弱:E5」のような短い文字列にする(文字選択肢のヒント用)。
function describePattern(pattern: AmplitudePattern): string {
  const strong = NOTE_NAMES.filter((_, i) => pattern[i] === 2);
  const weak = NOTE_NAMES.filter((_, i) => pattern[i] === 1);
  const parts: string[] = [];
  if (strong.length > 0) parts.push(`強:${strong.join("+")}`);
  if (weak.length > 0) parts.push(`弱:${weak.join("+")}`);
  return parts.length > 0 ? parts.join(" ") : "無音";
}

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
          const hint = describePattern(pattern);
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
        <p>チェックした周波数は実際には送信されません（電波状況が悪い状況のシミュレーション）。
           パイロット信号にも適用されるため、較正自体が失敗することもあります。</p>
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
      <p id="rx-status" class="rx-status">受信待ち…</p>
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
        複数の音を同時に、しかも「弱い/強い」の2段階の大きさで鳴らすことで、一度に多くの情報を
        送っています。
      </p>
      <p>
        1文字を送るときは、まず基準となる音量の「パイロット信号」（全チャンネルを強く同時に
        鳴らす）を送り、次に本体の記号、最後に確認用の記号をもう一度送ります。受信側はパイロットで
        音量の基準を測ってから本体の記号の強弱を判定し、2回送られた記号が一致していれば文字として
        受け取ります（一致しなければノイズ等によるエラーとして捨てます）。
      </p>
      <p>
        受信側はマイクで拾った音をFFT（周波数解析）で6つの音に分解し、どの音がどれくらいの
        強さで鳴っていたかを調べることで元の文字を復元しています。
      </p>
      <p>
        この仕組みは、5GやWi-Fiなどの通信で使われているOFDMという技術の考え方につながっています。
        本物のOFDMも、複数の周波数（サブキャリア）が互いに干渉しないよう周波数の間隔を精密に
        設計し、基準信号（パイロットサブキャリア）で通信状態を測り、振幅や位相を変化させて
        1つの周波数によりたくさんの情報を載せています。SignalChordはその考え方を、人間が
        聞き取れる音の高さと大きさに置き換えた簡易版です（位相の変調や誤り訂正符号などは
        省略しています）。
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

// 「届かなくする」がチェックされたチャンネルを強制的に無音(0)にする。
function applyLoss(pattern: AmplitudePattern): AmplitudePattern {
  return pattern.map((tier, i) => (lossCheckboxes[i].checked ? 0 : tier)) as unknown as AmplitudePattern;
}

function effectivePatternFor(char: Character): AmplitudePattern {
  return applyLoss(indexToPattern(charToIndex(char)));
}

function effectivePattern(): AmplitudePattern {
  return effectivePatternFor(select.value as Character);
}

function updateSelectedHighlight(): void {
  const effective = effectivePattern();
  txFreqBoxes.forEach((box, i) => {
    box.classList.toggle("selected", effective[i] === 2);
    box.classList.toggle("selected-weak", effective[i] === 1);
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

function setTxFreqBoxes(pattern: AmplitudePattern): void {
  txFreqBoxes.forEach((box, i) => {
    box.classList.toggle("tier-weak", pattern[i] === 1);
    box.classList.toggle("playing", pattern[i] === 2);
  });
}

function clearTxFreqBoxes(): void {
  txFreqBoxes.forEach((box) => box.classList.remove("tier-weak", "playing"));
}

// 文字列(1文字以上)を「パイロット→記号A→記号B(確認)」の3記号×文字数のシーケンスとして
// Web Audio自身の時間軸で正確にスケジューリングする。単発送信・まとめ送信の両方から使う。
function sendCharacters(chars: Character[]): void {
  if (txSending || chars.length === 0) return;

  txAudioContext ??= new AudioContext();
  if (txAudioContext.state === "suspended") {
    void txAudioContext.resume();
  }
  const audioContext = txAudioContext;

  setTxSending(true);
  textSendStatus.textContent = `送信内容: "${chars.join("")}"`;

  const leadIn = 0.1;
  const baseTime = audioContext.currentTime + leadIn;

  chars.forEach((char, charIndex) => {
    const charBaseTime = baseTime + charIndex * CHAR_TOTAL_SECONDS;
    const dataPattern = effectivePatternFor(char);
    const pilotPattern = applyLoss(PILOT_PATTERN);

    const phases: { pattern: AmplitudePattern; label: string }[] = [
      { pattern: pilotPattern, label: "パイロット信号(基準較正)" },
      { pattern: dataPattern, label: `記号A ("${char}")` },
      { pattern: dataPattern, label: `記号B (確認用、記号Aの繰り返し)` },
    ];

    phases.forEach((phase, phaseIndex) => {
      const startTime = charBaseTime + phaseIndex * STEP_SECONDS;
      playPattern(audioContext, phase.pattern, SYMBOL_DURATION_SECONDS, startTime);

      const delayMs = (startTime - audioContext.currentTime) * 1000;
      setTimeout(() => {
        setTxFreqBoxes(phase.pattern);
        textSendStatus.textContent = `送信中 (${charIndex + 1}/${chars.length}): ${phase.label}`;
      }, delayMs);
      setTimeout(
        () => {
          clearTxFreqBoxes();
        },
        delayMs + SYMBOL_DURATION_SECONDS * 1000,
      );
    });
  });

  const totalMs = (baseTime - audioContext.currentTime + chars.length * CHAR_TOTAL_SECONDS) * 1000;
  setTimeout(() => {
    textSendStatus.textContent = `送信完了: "${chars.join("")}"`;
    setTxSending(false);
  }, totalMs);
}

sendButton.addEventListener("click", () => {
  sendCharacters([select.value as Character]);
});

// 入力文字列のうち、ALPHABETに含まれる文字（ひらがな46音+句読点等）だけを送信対象として取り出す。
function sanitizeText(input: string): Character[] {
  return Array.from(input).filter((ch): ch is Character =>
    (ALPHABET as readonly string[]).includes(ch),
  );
}

sendTextButton.addEventListener("click", () => {
  sendCharacters(sanitizeText(textInput.value));
});

// --- 受信側 ---

const rxSection = document.getElementById("rx-section")!;
const rxFreqBoxes = Array.from(rxSection.querySelectorAll<HTMLDivElement>(".freq-box"));
const rxStatus = document.getElementById("rx-status")!;
const rxHistory = document.getElementById("rx-history")!;
const rxDebug = document.getElementById("rx-debug")!;
const micStartButton = document.getElementById("mic-start") as HTMLButtonElement;
const micStopButton = document.getElementById("mic-stop") as HTMLButtonElement;

let rxAudioContext: AudioContext | null = null;
let receiverHandle: ReceiverHandle | null = null;
let rafId: number | null = null;
let historyHtml = "";

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
  rxStatus.textContent = "受信待ち…";
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
    rxStatus.textContent = "受信待ち…（パイロット信号を待っています）";

    const decoder = new ProtocolDecoder();

    const loop = () => {
      if (!receiverHandle || !rxAudioContext) return;
      const levelsDb = measure(receiverHandle.analyser, rxAudioContext.sampleRate);

      // 表示用: 較正前でも見た目で分かるよう、絶対しきい値だけで「聞こえているか」を示す。
      rxFreqBoxes.forEach((box, i) => box.classList.toggle("playing", levelsDb[i] >= SILENCE_THRESHOLD_DB));

      const event = decoder.push(levelsDb);
      if (event) {
        switch (event.type) {
          case "pilot-detected":
            rxStatus.textContent = "パイロット検出 → 振幅を較正中…";
            break;
          case "symbol-a":
            rxStatus.textContent = "記号Aを受信 → 確認用の記号Bを待っています…";
            break;
          case "char-accepted":
            historyHtml += event.char;
            rxHistory.innerHTML = historyHtml;
            rxStatus.textContent = `"${event.char}" を受信しました`;
            break;
          case "char-error":
            historyHtml += '<span class="rx-error">□</span>';
            rxHistory.innerHTML = historyHtml;
            rxStatus.textContent = "記号Aと記号Bが一致しませんでした（エラーとして破棄）";
            break;
        }
      }

      rxDebug.textContent = NOTE_NAMES.map((name, i) => `${name}: ${levelsDb[i].toFixed(1)} dB`).join("\n");
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
