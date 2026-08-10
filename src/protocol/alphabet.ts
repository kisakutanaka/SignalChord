import { NOTE_NAMES } from "../audio/frequencies";
import type { BitPattern } from "../audio/transmitter";

// 5bit=32通りのうち、全ビットOFF（index 0）は「無音」＝未送信の状態と音として区別できない
// ため、文字の割り当てには使わず予約する。使える文字は31種類（index 1〜31）。
// 詳細はFindings.mdを参照。
export const ALPHABET = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  " ", ".", ",", "!", "?",
] as const;

export type Character = (typeof ALPHABET)[number];

export function charToIndex(char: Character): number {
  return ALPHABET.indexOf(char) + 1;
}

export function indexToChar(index: number): Character | undefined {
  return index === 0 ? undefined : ALPHABET[index - 1];
}

export function indexToPattern(index: number): BitPattern {
  return NOTE_NAMES.map((_, bit) => Boolean((index >> bit) & 1)) as unknown as BitPattern;
}

export function patternToIndex(pattern: BitPattern): number {
  return pattern.reduce((total, isOn, bit) => (isOn ? total | (1 << bit) : total), 0);
}

export function activeNotes(pattern: BitPattern) {
  return NOTE_NAMES.filter((_, bit) => pattern[bit]);
}
