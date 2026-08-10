import { FREQUENCIES, NOTE_NAMES } from "./frequencies";

// NOTE_NAMES と同じ並び（C5,D5,E5,G5,A5）で、鳴らす音をtrueにする5要素のビットパターン。
export type BitPattern = readonly [boolean, boolean, boolean, boolean, boolean];

export const SILENT_PATTERN: BitPattern = [false, false, false, false, false];

// 複数音を同時に鳴らしたときの音量合算によるクリッピングを避けるためのゲイン。
const GAIN_PER_NOTE = 0.15;

// 音の開始/終了を急な矩形状にすると、受信側のFFTがその瞬間だけ広帯域にスペクトル漏れを
// 起こし、他の周波数も一時的にONと誤検出されうる（Findings.md参照）。数msのランプで
// 立ち上がり/立ち下がりを滑らかにし、この漏れを抑える。
const RAMP_SECONDS = 0.015;

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

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(GAIN_PER_NOTE, startTime + RAMP_SECONDS);
    gain.gain.setValueAtTime(GAIN_PER_NOTE, stopTime - RAMP_SECONDS);
    gain.gain.linearRampToValueAtTime(0, stopTime);

    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    });

    oscillator.start(startTime);
    oscillator.stop(stopTime);
  });
}
