import "./style.css";
import { NOTE_NAMES } from "./audio/frequencies";
import { playPattern, type BitPattern } from "./audio/transmitter";

const TEST_DURATION_SECONDS = 1;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div>
    <h1>SignalChord</h1>
    <p>Phase 1: 送信テスト（鳴らしたい音にチェックして送信）</p>
    <div id="notes">
      ${NOTE_NAMES.map(
        (name) => `
        <label>
          <input type="checkbox" name="note" value="${name}" checked />
          ${name}
        </label>`,
      ).join("")}
    </div>
    <button id="send">テスト送信</button>
  </div>
`;

let audioContext: AudioContext | null = null;

document.getElementById("send")!.addEventListener("click", () => {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  const checkboxes = document.querySelectorAll<HTMLInputElement>('input[name="note"]');
  const pattern = Array.from(checkboxes).map((checkbox) => checkbox.checked) as unknown as BitPattern;

  playPattern(audioContext, pattern, TEST_DURATION_SECONDS);
});
