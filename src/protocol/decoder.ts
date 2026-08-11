import { ALPHABET, indexToChar, patternToIndex, PILOT_INDEX, type Character } from "./alphabet";
import type { AmplitudePattern, AmplitudeTier } from "../audio/transmitter";

// 何フレーム連続で同じ状態が観測されたら「安定した」とみなすか。
// requestAnimationFrame(約60fps)基準で、瞬間的なノイズによる誤判定を抑えつつ、
// 1回の送信には十分間に合う短さにする。
const STABLE_FRAMES_REQUIRED = 12;

// 無音とみなす絶対しきい値。パイロット検出前(較正前)や、記号どうしの間の無音判定に使う。
// UI側の「聞こえているかどうか」の簡易表示にも流用するためexportする。
export const SILENCE_THRESHOLD_DB = -60;

// 全チャンネルが「はっきり大きい音」とみなせる絶対しきい値。パイロット(全チャンネルSTRONG)
// の検出に使う。較正はまだ済んでいないので、この段階だけは絶対しきい値で判定する。
const PILOT_THRESHOLD_DB = -45;

// パイロットで測った基準レベル(STRONG相当)から、この範囲内ならSTRONGとみなす。
const STRONG_MARGIN_DB = 6;
// 基準レベルからこの範囲内(かつSTRONGでなければ)WEAKとみなす。WEAK_GAIN/STRONG_GAINの比
// (1/3、約-9.5dB)を踏まえ、-6dB〜-16dBの帯をWEAKとしている（実測はFindings.md参照）。
const WEAK_MARGIN_DB = 16;

type State = "idle" | "wait-silence-after-pilot" | "wait-a" | "wait-silence-after-a" | "wait-b";

export type DecodeEvent =
  | { type: "pilot-detected" }
  | { type: "symbol-a" }
  | { type: "char-accepted"; char: Character }
  | { type: "char-error" };

function classifyTier(levelDb: number, referenceDb: number): AmplitudeTier {
  if (levelDb >= referenceDb - STRONG_MARGIN_DB) return 2;
  if (levelDb >= referenceDb - WEAK_MARGIN_DB) return 1;
  return 0;
}

// 受信プロトコル全体を管理するステートフルなデコーダー。
//
// 1回の文字送信は「パイロット(全チャンネルSTRONG、同期・振幅較正用) → 無音 → 記号A →
// 無音 → 記号B(記号Aの繰り返し) → 無音」という並びで送られてくる想定。
// パイロットで振幅の基準レベルを測り、それを基に記号A/Bそれぞれの振幅段階(無音/弱/強)を
// 判定する。記号Aと記号Bが一致すれば1文字確定、不一致ならその文字を破棄してエラーを通知する
// （単純な繰り返しによる誤り検出）。
export class ProtocolDecoder {
  private state: State = "idle";
  private referenceDb = 0;
  private indexA = 0;

  private stableKey = "";
  private stableCount = 0;

  // 1フレーム分のdBレベル列(NOTE_NAMESと同じ並び)を渡す。状態が進んだ場合はイベントを返す。
  push(levelsDb: number[]): DecodeEvent | undefined {
    const isSilent = levelsDb.every((db) => db < SILENCE_THRESHOLD_DB);

    let key: string;
    if (isSilent) {
      key = "silence";
    } else if (this.state === "idle" || this.state === "wait-silence-after-pilot") {
      // 較正前はパイロットかどうかだけを絶対しきい値で判定する。
      const isPilotLevel = levelsDb.every((db) => db >= PILOT_THRESHOLD_DB);
      key = isPilotLevel ? "pilot" : "noise";
    } else {
      const tiers = levelsDb.map((db) => classifyTier(db, this.referenceDb)) as unknown as AmplitudePattern;
      key = `sym:${patternToIndex(tiers)}`;
    }

    if (key === this.stableKey) {
      this.stableCount++;
    } else {
      this.stableKey = key;
      this.stableCount = 1;
    }

    if (this.stableCount !== STABLE_FRAMES_REQUIRED) {
      return undefined;
    }

    switch (this.state) {
      case "idle": {
        if (key !== "pilot") return undefined;
        this.referenceDb = levelsDb.reduce((sum, db) => sum + db, 0) / levelsDb.length;
        this.state = "wait-silence-after-pilot";
        return { type: "pilot-detected" };
      }

      case "wait-silence-after-pilot": {
        if (key === "silence") {
          this.state = "wait-a";
        }
        return undefined;
      }

      case "wait-a": {
        if (!key.startsWith("sym:")) return undefined;
        this.indexA = Number(key.slice(4));
        this.state = "wait-silence-after-a";
        return { type: "symbol-a" };
      }

      case "wait-silence-after-a": {
        if (key === "silence") {
          this.state = "wait-b";
        }
        return undefined;
      }

      case "wait-b": {
        if (!key.startsWith("sym:")) return undefined;
        const indexB = Number(key.slice(4));
        this.state = "idle";
        this.stableKey = "";
        this.stableCount = 0;

        if (indexB !== this.indexA || indexB === PILOT_INDEX || indexB < 1 || indexB > ALPHABET.length) {
          return { type: "char-error" };
        }
        return { type: "char-accepted", char: indexToChar(indexB)! };
      }
    }
  }
}
