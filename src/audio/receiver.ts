import { FREQUENCIES } from "./frequencies";
import type { BitPattern } from "./transmitter";

export const FFT_SIZE = 4096;

// 実機での校正が必要な暫定値。Findings.md参照。
export const DEFAULT_THRESHOLD_DB = -60;

export interface ReceiverHandle {
  analyser: AnalyserNode;
  stream: MediaStream;
  stop(): void;
}

export async function startReceiving(audioContext: AudioContext): Promise<ReceiverHandle> {
  // echoCancellation/noiseSuppression/autoGainControlは音声通話向けの処理で、
  // 定常的な単一〜複数トーンの検出には悪影響を与えうるため無効化する。
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  return {
    analyser,
    stream,
    stop() {
      stream.getTracks().forEach((track) => track.stop());
      source.disconnect();
      analyser.disconnect();
    },
  };
}

function frequencyToBinIndex(frequency: number, sampleRate: number, fftSize: number): number {
  return Math.round((frequency / sampleRate) * fftSize);
}

export interface Measurement {
  // FREQUENCIES/NOTE_NAMESと同じ並びの、各周波数付近のピーク強度(dBFS)
  levelsDb: number[];
  pattern: BitPattern;
}

// 各対象周波数のビン付近(±1)のピークを読み取り、しきい値を超えていればON(true)とする。
// ±1を見るのはAnalyserNode内部の窓関数によるスペクトル漏れと、目的周波数がビン境界と
// 完全に一致しない場合を吸収するため。
export function measure(
  analyser: AnalyserNode,
  sampleRate: number,
  thresholdDb: number = DEFAULT_THRESHOLD_DB,
): Measurement {
  const magnitudes = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(magnitudes);

  const levelsDb = FREQUENCIES.map((freq) => {
    const bin = frequencyToBinIndex(freq, sampleRate, analyser.fftSize);
    const window = [bin - 1, bin, bin + 1].filter((i) => i >= 0 && i < magnitudes.length);
    return Math.max(...window.map((i) => magnitudes[i]));
  });

  const pattern = levelsDb.map((db) => db >= thresholdDb) as unknown as BitPattern;

  return { levelsDb, pattern };
}
