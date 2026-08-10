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
  </div>
`;

// --- 送信側 ---

const txSection = document.getElementById("tx-section")!;
const select = document.getElementById("char-select") as HTMLSelectElement;
const txFreqBoxes = Array.from(txSection.querySelectorAll<HTMLDivElement>(".freq-box"));

function currentPattern() {
  return indexToPattern(charToIndex(select.value as Character));
}

function updateSelectedHighlight(): void {
  const pattern = currentPattern();
  txFreqBoxes.forEach((box, i) => box.classList.toggle("selected", pattern[i]));
}

select.addEventListener("change", updateSelectedHighlight);
updateSelectedHighlight();

let txAudioContext: AudioContext | null = null;

document.getElementById("send")!.addEventListener("click", () => {
  txAudioContext ??= new AudioContext();
  if (txAudioContext.state === "suspended") {
    void txAudioContext.resume();
  }

  const pattern = currentPattern();
  playPattern(txAudioContext, pattern, SEND_DURATION_SECONDS);

  txFreqBoxes.forEach((box, i) => box.classList.toggle("playing", pattern[i]));
  setTimeout(() => {
    txFreqBoxes.forEach((box) => box.classList.remove("playing"));
  }, SEND_DURATION_SECONDS * 1000);
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
