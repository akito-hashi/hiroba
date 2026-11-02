import type { CpuLevel } from '../games/types';
import { GOAL, LAST_TRACK, LudoGame, type LudoState, START_POS, TRACK, absolutePos } from './rules';

export type LudoAction = { type: 'roll' } | { type: 'move'; piece: number };

const SAFE = new Set(START_POS);

// 盤上の pos にいるコマを、相手のコマが次の1回（1〜6）で蹴落とせる数
function threats(state: LudoState, seat: number, pos: number): number {
  if (SAFE.has(pos)) return 0;
  let n = 0;
  state.players.forEach((p, i) => {
    if (i === seat || p.removed) return;
    for (const x of p.pieces) {
      if (x < 0 || x > LAST_TRACK) continue;
      const behind = (pos - absolutePos(p.color, x) + TRACK) % TRACK;
      if (behind >= 1 && behind <= 6) n++;
    }
  });
  return n;
}

const onBoard = (p: number) => p >= 0 && p <= LAST_TRACK;
const homeCount = (s: LudoState) => s.players.reduce((sum, p) => sum + p.pieces.filter((x) => x === -1).length, 0);

// そのコマを動かした結果に点数を付ける
function scoreMove(state: LudoState, piece: number, strong: boolean): number {
  const seat = state.current;
  const me = state.players[seat];
  const from = me.pieces[piece];
  const g = LudoGame.restore(state, Math.random);
  g.move(seat, piece);
  const after = g.state();
  const to = after.players[seat].pieces[piece];

  let score = (to === -1 ? 0 : to) - (from === -1 ? 0 : from);
  // 相手のコマが戻った数（自分のコマは戻らない）
  const captured = homeCount(after) - homeCount(state) - (from === -1 ? -1 : 0);
  score += captured * 50;
  if (to === GOAL) score += 40;
  if (from === -1) score += 30;
  if (to > LAST_TRACK || SAFE.has(absolutePos(me.color, to))) score += 10;
  if (strong) {
    if (onBoard(to)) score -= threats(after, seat, absolutePos(me.color, to)) * 25;
    // 狙われているコマを逃がすのは得
    if (onBoard(from)) score += threats(state, seat, absolutePos(me.color, from)) * 15;
  }
  return score;
}

export function decideLudo(state: LudoState, level: CpuLevel, rng: () => number): LudoAction {
  if (state.phase === 'roll') return { type: 'roll' };
  const moves = LudoGame.restore(state, Math.random).legalMoves();
  if (moves.length === 0) return { type: 'roll' };
  if (level === 'weak') return { type: 'move', piece: moves[Math.floor(rng() * moves.length)] };
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const sc = scoreMove(state, m, level === 'strong');
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  return { type: 'move', piece: best };
}
