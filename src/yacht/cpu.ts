import type { YachtState } from './game';
import { CATEGORIES, type Category, DICE_COUNT, type Dice, MAX_ROLLS, type Sheet, UPPER, UPPER_BONUS, scoreFor, upperTotal, UPPER_BONUS_THRESHOLD } from './rules';

export type CpuLevel = 'weak' | 'normal' | 'strong';
export type CpuAction = { type: 'hold'; held: boolean[] } | { type: 'roll' } | { type: 'score'; category: Category };

// ふつう: この点以上が取れるならその場で記入する
const GOOD_ENOUGH = 25;
// 0 点しか取れないときに捨てる順
const DUMP_ORDER: Category[] = ['ones', 'twos', 'yacht', ...CATEGORIES.filter((c) => !['ones', 'twos', 'yacht'].includes(c))];
// つよい: 役ごとの「ふつうに遊べば取れる点」。これより低い点で埋めるのは損とみなす
const PAR: Record<Category, number> = {
  ones: 2,
  twos: 5,
  threes: 8,
  fours: 11,
  fives: 14,
  sixes: 17,
  choice: 22,
  fourDice: 13,
  fullHouse: 15,
  sStraight: 11,
  bStraight: 9,
  yacht: 10,
};

const emptyCats = (sheet: Sheet) => CATEGORIES.filter((c) => sheet[c] === undefined);
const pick = <T>(xs: T[], rng: () => number) => xs[Math.floor(rng() * xs.length)];

function bestByScore(sheet: Sheet, dice: Dice): Category {
  const empty = emptyCats(sheet);
  let best = empty[0];
  for (const c of empty) if (scoreFor(c, dice) > scoreFor(best, dice)) best = c;
  if (scoreFor(best, dice) > 0) return best;
  return DUMP_ORDER.find((c) => sheet[c] === undefined)!;
}

// つよい: 点そのものに、ボーナスへの近づき具合と「その役を使ってしまう損」を加味した評価
function value(sheet: Sheet, cat: Category, dice: Dice): number {
  const score = scoreFor(cat, dice);
  let v = score - PAR[cat];
  const face = UPPER.indexOf(cat) + 1;
  if (face > 0 && upperTotal(sheet) < UPPER_BONUS_THRESHOLD) {
    // 1つの目につき3個がボーナスの目安。上回れば得、下回れば損
    v += ((score - 3 * face) * UPPER_BONUS) / UPPER_BONUS_THRESHOLD;
  }
  return v;
}

function bestByValue(sheet: Sheet, dice: Dice): { cat: Category; v: number } {
  let best = { cat: emptyCats(sheet)[0], v: -Infinity };
  for (const c of emptyCats(sheet)) {
    const v = value(sheet, c, dice);
    if (v > best.v) best = { cat: c, v };
  }
  return best;
}

// ホールドしなかった目を振り直したときの、記入できる最高評価の期待値（1回先まで）
// 目の並び順は評価に関係ないので、並べ替えた目ごとに覚えておく（252通りしかない）
function expectedAfterReroll(sheet: Sheet, dice: Dice, held: boolean[], memo: Map<string, number>): number {
  const free = held.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
  const outcomes = 6 ** free.length;
  const next = [...dice];
  let sum = 0;
  for (let k = 0; k < outcomes; k++) {
    let n = k;
    for (const i of free) {
      next[i] = (n % 6) + 1;
      n = Math.floor(n / 6);
    }
    const key = [...next].sort().join('');
    let v = memo.get(key);
    if (v === undefined) {
      v = bestByValue(sheet, next).v;
      memo.set(key, v);
    }
    sum += v;
  }
  return sum / outcomes;
}

function holdOrRoll(current: boolean[], want: boolean[]): CpuAction {
  return want.every((h, i) => h === current[i]) ? { type: 'roll' } : { type: 'hold', held: want };
}

export function decideCpu(state: YachtState, seat: number, level: CpuLevel, rng: () => number): CpuAction {
  const { dice, held, rollsUsed } = state;
  const sheet = state.players[seat].sheet;
  if (rollsUsed === 0) return { type: 'roll' };
  const lastRoll = rollsUsed >= MAX_ROLLS;

  if (level === 'weak') {
    // でたらめ: 半々で記入か全部振り直し
    if (lastRoll || rng() < 0.5) return { type: 'score', category: pick(emptyCats(sheet), rng) };
    return { type: 'roll' };
  }

  if (level === 'normal') {
    const best = bestByScore(sheet, dice);
    if (lastRoll || scoreFor(best, dice) >= GOOD_ENOUGH) return { type: 'score', category: best };
    // いちばん多い目（同数なら大きい目）を残す
    let face = 6;
    for (let f = 6; f >= 1; f--) if (dice.filter((d) => d === f).length > dice.filter((d) => d === face).length) face = f;
    return holdOrRoll(held, dice.map((d) => d === face));
  }

  const now = bestByValue(sheet, dice);
  if (lastRoll) return { type: 'score', category: now.cat };
  let bestHold: boolean[] | null = null;
  let bestEv = now.v;
  const memo = new Map<string, number>();
  for (let mask = 0; mask < 2 ** DICE_COUNT - 1; mask++) {
    const want = dice.map((_, i) => ((mask >> i) & 1) === 1);
    const ev = expectedAfterReroll(sheet, dice, want, memo);
    if (ev > bestEv) {
      bestEv = ev;
      bestHold = want;
    }
  }
  if (!bestHold) return { type: 'score', category: now.cat };
  return holdOrRoll(held, bestHold);
}
