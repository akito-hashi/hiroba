import { BALL_COLORS, type Board } from './board';
import { COLS, ROWS, type Cell, inBounds, step } from './grid';
import type { ChunkShape } from './resolve';

// 予告から何手後に降るか
export const GARBAGE_DELAY = 2;

export const CHUNK_SIZE: Record<ChunkShape, number> = { hexagon: 7, pyramid: 6, straight: 6, single: 1 };

function walk(start: Cell, dirs: number[]): Cell {
  return dirs.reduce((cell, d) => step(cell, d), start);
}

// 塊のボール位置。anchor はヘキサゴンなら中心、それ以外は左下。
export function chunkCells(shape: ChunkShape, anchor: Cell): Cell[] {
  switch (shape) {
    case 'hexagon':
      return [anchor, ...[0, 1, 2, 3, 4, 5].map((d) => step(anchor, d))];
    case 'pyramid':
      return [[], [0], [0, 0], [1], [1, 0], [1, 1]].map((dirs) => walk(anchor, dirs));
    case 'straight':
      return [0, 1, 2, 3, 4, 5].map((i) => ({ c: anchor.c + i, r: anchor.r }));
    case 'single':
      return [anchor];
  }
}

// 塊が盤面の一番上に収まるよう、anchor を置く段
const ANCHOR_ROW: Record<ChunkShape, number> = {
  hexagon: ROWS - 2,
  pyramid: ROWS - 3,
  straight: ROWS - 1,
  single: ROWS - 1,
};

type Pending = { chunks: ChunkShape[]; turnsLeft: number };

export class GarbageQueue {
  private pending: Pending[] = [];

  add(chunks: ChunkShape[]): void {
    if (chunks.length > 0) this.pending.push({ chunks: [...chunks], turnsLeft: GARBAGE_DELAY });
  }

  // 予告中の塊の数
  pendingTotal(): number {
    return this.pending.reduce((sum, p) => sum + p.chunks.length, 0);
  }

  // 自分の塊1つで、古い予告の塊を1つ打ち消す。打ち消しきれなかった分を返す。
  offset(attack: ChunkShape[]): ChunkShape[] {
    const rest = [...attack];
    while (rest.length > 0 && this.pending.length > 0) {
      rest.shift();
      const head = this.pending[0];
      head.chunks.shift();
      if (head.chunks.length === 0) this.pending.shift();
    }
    return rest;
  }

  // ピースを1つ置くたびに呼ぶ。時間切れの予告を盤面に降らせる。
  onPiecePlaced(board: Board, rng: () => number): void {
    const drop: ChunkShape[] = [];
    for (const p of this.pending) {
      p.turnsLeft--;
      if (p.turnsLeft <= 0) drop.push(...p.chunks);
    }
    this.pending = this.pending.filter((p) => p.turnsLeft > 0);
    for (const shape of drop) {
      // 置ける場所がなくなったら、それ以上は置けない（どのみち負け）
      if (!dropChunk(board, shape, rng)) return;
    }
  }
}

// 一番上の空いている場所にランダムな列で塊を置き、落とす。置けなければ false。
function dropChunk(board: Board, shape: ChunkShape, rng: () => number): boolean {
  const r = ANCHOR_ROW[shape];
  const spots: Cell[][] = [];
  for (let c = 0; c < COLS; c++) {
    const cells = chunkCells(shape, { c, r });
    if (cells.every((cell) => inBounds(cell) && board.isEmpty(cell))) spots.push(cells);
  }
  if (spots.length === 0) return false;
  const cells = spots[Math.floor(rng() * spots.length)];
  for (const cell of cells) board.set(cell, BALL_COLORS[Math.floor(rng() * BALL_COLORS.length)]);
  board.settle();
  return true;
}
