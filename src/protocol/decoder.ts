import { indexToChar, patternToIndex, type Character } from "./alphabet";
import type { BitPattern } from "../audio/transmitter";

// 何フレーム連続で同じパターンが観測されたら「安定した」とみなすか。
// requestAnimationFrame(約60fps)基準で、瞬間的なノイズによる誤判定を抑えつつ、
// 1回の送信（1秒）には十分間に合う短さにする。
const STABLE_FRAMES_REQUIRED = 12;

// FFT解析結果(BitPattern)の連続したフレーム列から、1回の送信につき1文字だけを
// 復元するステートフルなデコーダー。無音(index 0)を挟まずに同じ文字が続く間は
// 重複して確定させない。
export class StreamDecoder {
  private stableIndex = 0;
  private stableCount = 0;
  private accepted = false;

  // 1フレーム分の判定結果を渡す。新しく1文字確定した場合はその文字を返す。
  push(pattern: BitPattern): Character | undefined {
    const index = patternToIndex(pattern);

    if (index === this.stableIndex) {
      this.stableCount++;
    } else {
      this.stableIndex = index;
      this.stableCount = 1;
    }

    if (this.stableCount < STABLE_FRAMES_REQUIRED) {
      return undefined;
    }

    if (index === 0) {
      this.accepted = false;
      return undefined;
    }

    if (this.accepted) {
      return undefined;
    }

    this.accepted = true;
    return indexToChar(index);
  }

  // 現在安定して観測されている文字（確定・未確定を問わない、表示用）
  get currentChar(): Character | undefined {
    if (this.stableCount < STABLE_FRAMES_REQUIRED) return undefined;
    return indexToChar(this.stableIndex);
  }
}
