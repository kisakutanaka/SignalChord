// Cメジャーペンタトニックの5音。通信時のチャンネル順もこの並びに固定する。
export const NOTE_FREQUENCIES = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
} as const;

export type NoteName = keyof typeof NOTE_FREQUENCIES;

export const NOTE_NAMES = Object.keys(NOTE_FREQUENCIES) as NoteName[];

export const FREQUENCIES = NOTE_NAMES.map((name) => NOTE_FREQUENCIES[name]);
