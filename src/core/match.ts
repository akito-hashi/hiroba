import type { Board } from './board';
import { type Cell, inBounds, neighbors, step } from './grid';

export type Role = 'hexagon' | 'pyramid' | 'straight';

export const MIN_GROUP = 6;

const key = ({ c, r }: Cell) => `${c},${r}`;

// 同色で MIN_GROUP 個以上繋がったグループ
export function findGroups(board: Board): Cell[][] {
  const seen = new Set<string>();
  const groups: Cell[][] = [];
  for (const start of board.filled()) {
    const color = board.get(start);
    if (seen.has(key(start))) continue;
    const group: Cell[] = [];
    const stack = [start];
    seen.add(key(start));
    while (stack.length > 0) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const n of neighbors(cur)) {
        if (!seen.has(key(n)) && board.get(n) === color) {
          seen.add(key(n));
          stack.push(n);
        }
      }
    }
    if (group.length >= MIN_GROUP) groups.push(group);
  }
  return groups;
}

function walk(start: Cell, dirs: number[]): Cell {
  return dirs.reduce((cell, d) => step(cell, d), start);
}

function shapesFrom(a: Cell): Record<Role, Cell[][]> {
  // ピラミッドの2段目の向き: 1=北東（上向き）, 5=南東（下向き）
  const pyramid = (up: number) => [
    a,
    walk(a, [0]),
    walk(a, [0, 0]),
    walk(a, [up]),
    walk(a, [up, 0]),
    walk(a, [up, up]),
  ];
  return {
    hexagon: [[0, 1, 2, 3, 4, 5].map((d) => step(a, d))],
    pyramid: [pyramid(1), pyramid(5)],
    straight: [0, 1, 2].map((d) => [0, 1, 2, 3, 4, 5].map((i) => walk(a, new Array(i).fill(d)))),
  };
}

// グループの中に役の形が含まれていれば、強い順に1つ返す
export function detectRole(group: Cell[]): Role | null {
  const inGroup = new Set(group.map(key));
  const contains = (shape: Cell[]) => shape.every((cell) => inBounds(cell) && inGroup.has(key(cell)));
  // ヘキサゴンの中心はグループ外（空きや別の色）でもよいので、隣接セルも候補にする
  const anchors = new Map<string, Cell>();
  for (const cell of group) {
    anchors.set(key(cell), cell);
    for (const n of neighbors(cell)) anchors.set(key(n), n);
  }
  for (const role of ['hexagon', 'pyramid', 'straight'] as Role[]) {
    for (const a of anchors.values()) {
      if (shapesFrom(a)[role].some(contains)) return role;
    }
  }
  return null;
}
