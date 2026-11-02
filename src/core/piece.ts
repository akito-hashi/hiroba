import type { Board, Color } from './board';
import { type Cell, inBounds, step } from './grid';

// 三角ピース。pivot と、pivot から見て rot 方向・rot+1 方向の2マスで三角形になる。
export type Piece = { colors: [Color, Color, Color]; pivot: Cell; rot: number };

export const SPAWN_PIVOT: Cell = { c: 4, r: 16 };
// rot1 = 北東と北西 → 上向きの三角
const SPAWN_ROT = 1;

export function spawnPiece(colors: [Color, Color, Color]): Piece {
  return { colors, pivot: { ...SPAWN_PIVOT }, rot: SPAWN_ROT };
}

export function pieceCells(p: Piece): Cell[] {
  return [p.pivot, step(p.pivot, p.rot), step(p.pivot, p.rot + 1)];
}

export function canPlace(p: Piece, board: Board): boolean {
  return pieceCells(p).every((cell) => inBounds(cell) && board.isEmpty(cell));
}

function shifted(p: Piece, dc: number, dr = 0): Piece {
  return { ...p, pivot: { c: p.pivot.c + dc, r: p.pivot.r + dr } };
}

export function moveH(p: Piece, dc: number, board: Board): Piece | null {
  const next = shifted(p, dc);
  return canPlace(next, board) ? next : null;
}

// ずれた段で左右にぶれないよう、2段（同じ列の真下）ずつ落とす
export function moveDown(p: Piece, board: Board): Piece | null {
  const next = shifted(p, 0, -2);
  return canPlace(next, board) ? next : null;
}

// 回せなければ左右に1マスずらして試し、それでも駄目なら元のまま
export function rotate(p: Piece, dir: 1 | -1, board: Board): Piece {
  const turned: Piece = { ...p, rot: (p.rot + dir + 6) % 6 };
  for (const dc of [0, -1, 1]) {
    const candidate = shifted(turned, dc);
    if (canPlace(candidate, board)) return candidate;
  }
  return p;
}
