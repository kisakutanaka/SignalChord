import { FREQUENCIES, NOTE_NAMES } from "./frequencies";

// NOTE_NAMES と同じ並び（C5,D5,E5,G5,A5）で、鳴らす音をtrueにする5要素のビットパターン。
export type BitPattern = readonly [boolean, boolean, boolean, boolean, boolean];

export const SILENT_PATTERN: BitPattern = [false, false, false, false, false];

// 複数音を同時に鳴らしたときの音量合算によるクリッピングを避けるためのゲイン。
const GAIN_PER_NOTE = 0.15;

// patternでtrueになっている周波数だけを同時に再生する。durationSeconds後に自動停止する。
export function playPattern(
  audioContext: AudioContext,
  pattern: BitPattern,
  durationSeconds: number,
): void {
  if (pattern.length !== NOTE_NAMES.length) {
    throw new Error(`pattern must have ${NOTE_NAMES.length} elements`);
  }

  const startTime = audioContext.currentTime;
  const stopTime = startTime + durationSeconds;

  FREQUENCIES.forEach((frequency, index) => {
    if (!pattern[index]) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = GAIN_PER_NOTE;

    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    });

    oscillator.start(startTime);
    oscillator.stop(stopTime);
  });
}
