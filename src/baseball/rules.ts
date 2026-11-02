// 0 = 先攻（卓の主）, 1 = 後攻
export type Side = 0 | 1;
export const INNINGS = 3;
export type PitchResult = 'ball' | 'strike' | 'foul' | 'single' | 'double' | 'triple' | 'homer' | 'out';
export type Outcome = { winner: Side | 'draw'; reason: 'innings' | 'disconnect' | 'stalled' };
export type BaseballState = {
  inning: number; // 1〜INNINGS
  half: 'top' | 'bottom'; // 表は先攻が打つ
  balls: number;
  strikes: number;
  outs: number;
  bases: [boolean, boolean, boolean]; // 一塁・二塁・三塁
  score: [number, number];
  outcome: Outcome | null;
};

const BALLS_OUT = 4;
const STRIKES_OUT = 3;
const OUTS_CHANGE = 3;
// ヒットで進む塁の数（ホームランは全員が本塁を越える）
const BASES_FOR: Partial<Record<PitchResult, number>> = { single: 1, double: 2, triple: 3, homer: 4 };

export function initialState(): BaseballState {
  return {
    inning: 1,
    half: 'top',
    balls: 0,
    strikes: 0,
    outs: 0,
    bases: [false, false, false],
    score: [0, 0],
    outcome: null,
  };
}

export function battingSide(s: BaseballState): Side {
  return s.half === 'top' ? 0 : 1;
}

// 打席が終わったのでカウントを戻す
function endAtBat(s: BaseballState) {
  s.balls = 0;
  s.strikes = 0;
}

// 走者とバッターを n 塁分進め、本塁を越えた人数を得点にする
function advance(s: BaseballState, n: number) {
  const next: [boolean, boolean, boolean] = [false, false, false];
  let runs = 0;
  // from: 0〜2 は走者のいる塁、-1 はバッター
  const place = (from: number) => {
    const to = from + n;
    if (to >= 3) runs++;
    else next[to] = true;
  };
  s.bases.forEach((on, i) => on && place(i));
  place(-1);
  s.bases = next;
  s.score[battingSide(s)] += runs;
}

// 四球。後ろに詰まっている走者だけが進む
function walk(s: BaseballState) {
  const [first, second, third] = s.bases;
  if (first && second && third) s.score[battingSide(s)]++;
  s.bases = [true, first || second, third || (first && second)];
}

function addOut(s: BaseballState) {
  s.outs++;
  if (s.outs < OUTS_CHANGE) return;
  s.outs = 0;
  s.bases = [false, false, false];
  const [a, b] = s.score;
  if (s.half === 'top') {
    // 後攻がリードしていれば最終回の裏は行わない
    if (s.inning === INNINGS && b > a) s.outcome = { winner: 1, reason: 'innings' };
    else s.half = 'bottom';
  } else if (s.inning === INNINGS) {
    s.outcome = { winner: a === b ? 'draw' : a > b ? 0 : 1, reason: 'innings' };
  } else {
    s.inning++;
    s.half = 'top';
  }
}

export function applyResult(s: BaseballState, r: PitchResult): BaseballState {
  if (s.outcome) return s;
  const n = structuredClone(s);
  const bases = BASES_FOR[r];
  if (bases) {
    advance(n, bases);
    endAtBat(n);
  } else if (r === 'ball') {
    n.balls++;
    if (n.balls >= BALLS_OUT) {
      walk(n);
      endAtBat(n);
    }
  } else if (r === 'strike' || (r === 'foul' && n.strikes < STRIKES_OUT - 1)) {
    n.strikes++;
    if (n.strikes >= STRIKES_OUT) {
      endAtBat(n);
      addOut(n);
    }
  } else if (r === 'out') {
    endAtBat(n);
    addOut(n);
  }
  // 最終回の裏に後攻が勝ち越したらその場で終わる
  if (!n.outcome && n.half === 'bottom' && n.inning === INNINGS && n.score[1] > n.score[0]) {
    n.outcome = { winner: 1, reason: 'innings' };
  }
  return n;
}

export function forfeit(s: BaseballState, loser: Side, reason: 'disconnect' | 'stalled'): BaseballState {
  if (s.outcome) return s;
  return { ...structuredClone(s), outcome: { winner: loser === 0 ? 1 : 0, reason } };
}
