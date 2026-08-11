import { NOTE_NAMES } from "../audio/frequencies";
import type { AmplitudePattern, AmplitudeTier } from "../audio/transmitter";

// 各チャンネルは0(無音)/1(弱)/2(強)の3値を取れるため、6チャンネルで3^6=729通りを表現できる。
// 全チャンネルOFF（index 0）は「無音」＝未送信の状態と音として区別できないため文字には
// 割り当てず予約する。全チャンネルSTRONG（index 728, 3進数で222222）は、通常の文字送信では
// まず出現しない組み合わせとしてパイロット（同期・振幅較正用の基準信号）に予約する。
// 詳細はFindings.mdを参照。
//
// ひらがな46音（五十音、濁点/半濁点/拗音は含まない）+ 句読点・記号5種の51文字を収録。
// 日本での展示を想定し英字は廃止した。728通り中51文字しか使っておらず、将来ひらがな以外
// （濁点等）を追加する余地は大きい。
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

const TIER_COUNT = 3;
const CHANNEL_COUNT = NOTE_NAMES.length;

// 3^6-1=728。全チャンネルSTRONGとなるindexで、パイロット信号に使う。
export const PILOT_INDEX = TIER_COUNT ** CHANNEL_COUNT - 1;

export function charToIndex(char: Character): number {
  return ALPHABET.indexOf(char) + 1;
}

export function indexToChar(index: number): Character | undefined {
  if (index === 0 || index > ALPHABET.length) return undefined;
  return ALPHABET[index - 1];
}

// indexを3進数に展開し、桁ごとにNOTE_NAMESの各チャンネルの振幅段階とする。
export function indexToPattern(index: number): AmplitudePattern {
  const tiers: AmplitudeTier[] = [];
  let remaining = index;
  for (let i = 0; i < CHANNEL_COUNT; i++) {
    tiers.push((remaining % TIER_COUNT) as AmplitudeTier);
    remaining = Math.floor(remaining / TIER_COUNT);
  }
  return tiers as unknown as AmplitudePattern;
}

export function patternToIndex(pattern: AmplitudePattern): number {
  return pattern.reduce<number>((total, tier, i) => total + tier * TIER_COUNT ** i, 0);
}

// 全チャンネルSTRONGのパイロットパターン。
export const PILOT_PATTERN: AmplitudePattern = indexToPattern(PILOT_INDEX);

export function activeNotes(pattern: AmplitudePattern) {
  return NOTE_NAMES.filter((_, i) => pattern[i] > 0);
}
