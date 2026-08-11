import { NOTE_NAMES } from "../audio/frequencies";
import type { BitPattern } from "../audio/transmitter";

// 6bit=64通りのうち、全ビットOFF（index 0）は「無音」＝未送信の状態と音として区別できない
// ため、文字の割り当てには使わず予約する。使える文字は63種類（index 1〜63）。
// 詳細はFindings.mdを参照。
//
// ひらがな46音（五十音、濁点/半濁点/拗音は含まない）+ 句読点・記号5種の51文字を収録。
// 日本での展示を想定し英字は廃止した。63枠のうち12枠は将来の拡張（濁点等）用に未使用。
export const ALPHABET = [
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ", "を", "ん",
  " ", "、", "。", "!", "?",
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
