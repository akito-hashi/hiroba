import type { Board } from './board';
import type { Cell } from './grid';
import { MIN_GROUP, type Role, detectRole, findGroups } from './match';

// 相手に送るおじゃまの塊の形。役はその形の塊、役なしは単体ボール。
export type ChunkShape = Role | 'single';

export const ROLE_CHUNKS: Record<Role, { shape: Role; count: number }> = {
  hexagon: { shape: 'hexagon', count: 3 },
  pyramid: { shape: 'pyramid', count: 4 },
  straight: { shape: 'straight', count: 2 },
};
const PLAIN_SINGLES = 3;

export type ResolveResult = { chunks: ChunkShape[]; chains: number; roles: Role[]; clearedCells: Cell[] };

// 落下 → 消去 を連鎖が止まるまで繰り返す。board を直接書き換える。
export function resolve(board: Board): ResolveResult {
  const result: ResolveResult = { chunks: [], chains: 0, roles: [], clearedCells: [] };
  board.settle();
  for (;;) {
    const groups = findGroups(board);
    if (groups.length === 0) return result;
    result.chains++;

    const cleared: Cell[] = [];
    for (const group of groups) {
      const role = detectRole(group);
      if (role) {
        const color = board.get(group[0]);
        const { shape, count } = ROLE_CHUNKS[role];
        result.roles.push(role);
        result.chunks.push(...new Array<ChunkShape>(count).fill(shape));
        cleared.push(...[...board.filled()].filter((cell) => board.get(cell) === color));
      } else {
        result.chunks.push(...new Array<ChunkShape>(PLAIN_SINGLES + group.length - MIN_GROUP).fill('single'));
        cleared.push(...group);
      }
    }
    for (const cell of cleared) {
      if (board.get(cell) === null) continue; // 同じ色の役が2つ重なったときの重複
      board.set(cell, null);
      result.clearedCells.push(cell);
    }
    board.settle();
  }
}
