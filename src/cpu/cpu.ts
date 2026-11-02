import type { Board } from '../core/board';
import { CHUNK_SIZE } from '../core/garbage';
import { type Triple, simulatePlacement } from '../core/game';
import { COLS, type Cell, neighbors } from '../core/grid';
import { type Piece, SPAWN_PIVOT, canPlace } from '../core/piece';

export type CpuLevel = 'weak' | 'normal' | 'strong';
export type CpuMove = { c: number; rot: number };

// つよいが2手目まで読む候補の数（多いほど強いが重い）
const LOOKAHEAD_WIDTH = 6;

// 出現段で置ける (列, 向き) の全候補
function candidates(board: Board, colors: Triple): Piece[] {
  const out: Piece[] = [];
  for (let rot = 0; rot < 6; rot++) {
    for (let c = -1; c <= COLS; c++) {
      const p: Piece = { colors, pivot: { c, r: SPAWN_PIVOT.r }, rot };
      if (canPlace(p, board)) out.push(p);
    }
  }
  return out;
}

// 盤面の良さ: 同色の隣り合いが多く、低く積めているほど高い
function shapeScore(board: Board): number {
  let score = 0;
  let maxRow = 0;
  for (const cell of board.filled()) {
    const color = board.get(cell);
    maxRow = Math.max(maxRow, cell.r);
    score += neighbors(cell).filter((n: Cell) => board.get(n) === color).length;
  }
  return score - maxRow * 3;
}

function evaluate(board: Board, piece: Piece): { score: number; board: Board } {
  const sim = simulatePlacement(board, piece);
  if (sim.board.isOverLine()) return { score: -10000, board: sim.board };
  const attackBalls = sim.result.chunks.reduce((sum, shape) => sum + CHUNK_SIZE[shape], 0);
  return { score: attackBalls * 20 + shapeScore(sim.board), board: sim.board };
}

export function cpuChooseMove(board: Board, colors: Triple, next: Triple, level: CpuLevel, rng: () => number): CpuMove {
  const moves = candidates(board, colors);
  if (moves.length === 0) return { c: SPAWN_PIVOT.c, rot: 1 };
  const toMove = (p: Piece): CpuMove => ({ c: p.pivot.c, rot: p.rot });

  if (level === 'weak') return toMove(moves[Math.floor(rng() * moves.length)]);

  const ranked = moves
    .map((p) => ({ p, ...evaluate(board, p) }))
    .sort((a, b) => b.score - a.score);
  if (level === 'normal') return toMove(ranked[0].p);

  // つよい: 1手目の上位だけ、次のピースまで読んで2手合わせて一番良くなる手を選ぶ
  let best = ranked[0];
  let bestScore = -Infinity;
  for (const first of ranked.slice(0, LOOKAHEAD_WIDTH)) {
    let score = first.score;
    if (score > -10000) {
      const followUps = candidates(first.board, next).map((q) => evaluate(first.board, q).score);
      score += followUps.length > 0 ? Math.max(...followUps) * 0.5 : -10000;
    }
    if (score > bestScore) {
      bestScore = score;
      best = first;
    }
  }
  return toMove(best.p);
}
