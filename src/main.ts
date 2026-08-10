import "./style.css";
import { NOTE_NAMES } from "./audio/frequencies";
import { playPattern } from "./audio/transmitter";
import { ALPHABET, activeNotes, charToIndex, indexToPattern, type Character } from "./protocol/alphabet";

const SEND_DURATION_SECONDS = 1;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div>
    <h1>SignalChord</h1>
    <p>送りたい文字を選んで「送る」を押してください</p>
    <select id="char-select">
      ${ALPHABET.map((char) => {
        const pattern = indexToPattern(charToIndex(char));
        const hint = activeNotes(pattern).join("+");
        const label = char === " " ? "(スペース)" : char;
        return `<option value="${char}">${label} — ${hint}</option>`;
      }).join("")}
    </select>
    <div class="freq-display">
      ${NOTE_NAMES.map((name) => `<div class="freq-box" data-note="${name}">${name}</div>`).join("")}
    </div>
    <button id="send">送る</button>
  </div>
`;

const select = document.getElementById("char-select") as HTMLSelectElement;
const freqBoxes = Array.from(document.querySelectorAll<HTMLDivElement>(".freq-box"));

function currentPattern() {
  return indexToPattern(charToIndex(select.value as Character));
}

function updateSelectedHighlight(): void {
  const pattern = currentPattern();
  freqBoxes.forEach((box, i) => box.classList.toggle("selected", pattern[i]));
}

select.addEventListener("change", updateSelectedHighlight);
updateSelectedHighlight();

let audioContext: AudioContext | null = null;

document.getElementById("send")!.addEventListener("click", () => {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  const pattern = currentPattern();
  playPattern(audioContext, pattern, SEND_DURATION_SECONDS);

  freqBoxes.forEach((box, i) => box.classList.toggle("playing", pattern[i]));
  setTimeout(() => {
    freqBoxes.forEach((box) => box.classList.remove("playing"));
  }, SEND_DURATION_SECONDS * 1000);
});
