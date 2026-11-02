// ヨット（サイコロ5個で役を作り、点数を競う）
export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;

export type Dice = number[];

export const CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'choice',
  'fourDice',
  'fullHouse',
  'sStraight',
  'bStraight',
  'yacht',
] as const;
export type Category = (typeof CATEGORIES)[number];
export const TURNS = CATEGORIES.length;

export const UPPER: readonly Category[] = CATEGORIES.slice(0, 6);

export const CATEGORY_LABELS: Record<Category, string> = {
  ones: 'エース',
  twos: 'デュース',
  threes: 'トレイ',
  fours: 'フォー',
  fives: 'ファイブ',
  sixes: 'シックス',
  choice: 'チョイス',
  fourDice: 'フォーダイス',
  fullHouse: 'フルハウス',
  sStraight: 'S.ストレート',
  bStraight: 'B.ストレート',
  yacht: 'ヨット',
};

export type Sheet = Partial<Record<Category, number>>;

const sum = (dice: Dice) => dice.reduce((a, b) => a + b, 0);

// 目ごとの個数（添字 1〜6）
function counts(dice: Dice): number[] {
  const c = new Array<number>(7).fill(0);
  for (const d of dice) c[d]++;
  return c;
}

function longestRun(dice: Dice): number {
  const c = counts(dice);
  let best = 0;
  let run = 0;
  for (let face = 1; face <= 6; face++) {
    run = c[face] > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function scoreFor(cat: Category, dice: Dice): number {
  const upper = UPPER.indexOf(cat);
  if (upper >= 0) return dice.filter((d) => d === upper + 1).length * (upper + 1);
  const c = counts(dice);
  const most = Math.max(...c);
  switch (cat) {
    case 'choice':
      return sum(dice);
    case 'fourDice':
      return most >= 4 ? sum(dice) : 0;
    case 'fullHouse':
      // 5個同じはフルハウスに数えない
      return c.includes(3) && c.includes(2) ? sum(dice) : 0;
    case 'sStraight':
      return longestRun(dice) >= 4 ? 15 : 0;
    case 'bStraight':
      return longestRun(dice) === 5 ? 30 : 0;
    case 'yacht':
      return most === 5 ? 50 : 0;
  }
  return 0;
}

export function upperTotal(sheet: Sheet): number {
  return UPPER.reduce((a, cat) => a + (sheet[cat] ?? 0), 0);
}

export function upperBonus(sheet: Sheet): number {
  return upperTotal(sheet) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
}

export function total(sheet: Sheet): number {
  return CATEGORIES.reduce((a, cat) => a + (sheet[cat] ?? 0), 0) + upperBonus(sheet);
}

export function isDice(v: unknown): v is Dice {
  return Array.isArray(v) && v.length === DICE_COUNT && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 6);
}

export function isCategory(v: unknown): v is Category {
  return (CATEGORIES as readonly unknown[]).includes(v);
}
