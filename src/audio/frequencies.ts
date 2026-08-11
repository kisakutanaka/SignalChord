// Cメジャーペンタトニックの5音(C5,D5,E5,G5,A5)に、ひらがな46音+記号を6bitで
// 収めるためC6(C5の1オクターブ上)を追加した6音。C6はC5と同じ音名（ドレミソラ+ド）
// のため「ペンタトニック」の枠は保ったまま拡張できる。通信時のチャンネル順もこの並びに固定する。
//
// 標準チューニング(523.25Hz等)そのものではなく、受信側のFFT設定(fftSize=4096,
// 48000Hzサンプリングを仮定)のビン中心に周波数を合わせてある。本物のOFDMのサブキャリアが
// シンボル長の逆数(1/T)間隔に揃えられ、互いに直交する(漏れがゼロになる)よう設計されているのと
// 同じ考え方を踏襲したもの。ズレは最大でも約4Hz(半音の1/3程度、聴感上はほぼ気づかないレベル)。
// 受信側の実際のsampleRateが48000Hzでない場合は厳密な直交性は崩れるが、実測では
// 十分なマージンがある（Findings.md参照）。
export const NOTE_FREQUENCIES = {
  C5: 527.34375,
  D5: 585.9375,
  E5: 656.25,
  G5: 785.15625,
  A5: 878.90625,
  C6: 1042.96875,
} as const;

export type NoteName = keyof typeof NOTE_FREQUENCIES;

export const NOTE_NAMES = Object.keys(NOTE_FREQUENCIES) as NoteName[];

export const FREQUENCIES = NOTE_NAMES.map((name) => NOTE_FREQUENCIES[name]);
