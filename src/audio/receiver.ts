import { FREQUENCIES } from "./frequencies";

export const FFT_SIZE = 4096;

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

// FREQUENCIES/NOTE_NAMESと同じ並びの、各周波数付近のピーク強度(dBFS)を返す。
// 振幅段階(無音/弱/強)の判定はパイロット信号による較正が必要なため、ここでは行わず
// protocol/decoder.tsに委ねる。
//
// 各対象周波数のビン付近(±1)のピークを読み取る。±1を見るのはAnalyserNode内部の窓関数に
// よるスペクトル漏れと、目的周波数がビン境界と完全に一致しない場合を吸収するため。
export function measure(analyser: AnalyserNode, sampleRate: number): number[] {
  const magnitudes = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(magnitudes);

  return FREQUENCIES.map((freq) => {
    const bin = frequencyToBinIndex(freq, sampleRate, analyser.fftSize);
    const window = [bin - 1, bin, bin + 1].filter((i) => i >= 0 && i < magnitudes.length);
    return Math.max(...window.map((i) => magnitudes[i]));
  });
}
