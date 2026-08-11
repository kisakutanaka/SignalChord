// Cメジャーペンタトニックの5音(C5,D5,E5,G5,A5)に、ひらがな46音+記号を6bitで
// 収めるためC6(C5の1オクターブ上)を追加した6音。C6はC5と同じ音名（ドレミソラ+ド）
// のため「ペンタトニック」の枠は保ったまま拡張できる。通信時のチャンネル順もこの並びに固定する。
export const NOTE_FREQUENCIES = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
} as const;

export type NoteName = keyof typeof NOTE_FREQUENCIES;

export const NOTE_NAMES = Object.keys(NOTE_FREQUENCIES) as NoteName[];

export const FREQUENCIES = NOTE_NAMES.map((name) => NOTE_FREQUENCIES[name]);
