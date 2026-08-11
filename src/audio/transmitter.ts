import { FREQUENCIES, NOTE_NAMES } from "./frequencies";

// 各チャンネルの振幅段階。0=無音, 1=弱, 2=強（振幅ASKによる多値変調）。
export type AmplitudeTier = 0 | 1 | 2;

// NOTE_NAMES と同じ並び（C5,D5,E5,G5,A5,C6）で、各チャンネルの振幅段階を表す6要素のパターン。
export type AmplitudePattern = readonly [
  AmplitudeTier,
  AmplitudeTier,
  AmplitudeTier,
  AmplitudeTier,
  AmplitudeTier,
  AmplitudeTier,
];

export const SILENT_PATTERN: AmplitudePattern = [0, 0, 0, 0, 0, 0];

// 振幅段階ごとのゲイン。WEAKはSTRONGの1/3(約-9.5dB)とし、受信側で無音・弱・強を
// 十分なマージンを持って区別できるようにした（実測はFindings.md参照）。
const TIER_GAINS: readonly number[] = [0, 0.05, 0.15];

// 音の開始/終了を急な矩形状にすると、受信側のFFTがその瞬間だけ広帯域にスペクトル漏れを
// 起こし、他の周波数も一時的にONと誤検出されうる（Findings.md参照）。数msのランプで
// 立ち上がり/立ち下がりを滑らかにし、この漏れを抑える。
const RAMP_SECONDS = 0.015;

// patternの各チャンネルを、それぞれの振幅段階で同時に再生する。durationSeconds後に自動停止する。
// startTimeを指定すると、複数文字をsetTimeoutに頼らずWeb Audio自身の時間軸で正確に
// 連続スケジューリングできる（省略時は即座に再生）。
export function playPattern(
  audioContext: AudioContext,
  pattern: AmplitudePattern,
  durationSeconds: number,
  startTime: number = audioContext.currentTime,
): void {
  if (pattern.length !== NOTE_NAMES.length) {
    throw new Error(`pattern must have ${NOTE_NAMES.length} elements`);
  }

  const stopTime = startTime + durationSeconds;

  FREQUENCIES.forEach((frequency, index) => {
    const tier = pattern[index];
    if (tier === 0) return;
    const gain = TIER_GAINS[tier];

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gain, startTime + RAMP_SECONDS);
    gainNode.gain.setValueAtTime(gain, stopTime - RAMP_SECONDS);
    gainNode.gain.linearRampToValueAtTime(0, stopTime);

    oscillator.connect(gainNode).connect(audioContext.destination);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gainNode.disconnect();
    });

    oscillator.start(startTime);
    oscillator.stop(stopTime);
  });
}
