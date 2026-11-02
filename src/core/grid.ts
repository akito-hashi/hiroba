// 盤面の座標系。段0が一番下。奇数段は半個右にずれていて1マス少ない。
export type Cell = { c: number; r: number };

export const COLS = 10;
// 見える盤面は段0〜15。段15に残ったら負け。上の2段はピース出現用。
export const VISIBLE_ROWS = 16;
export const DANGER_ROW = 15;
export const ROWS = 18;

export function rowWidth(r: number): number {
  return r % 2 === 0 ? COLS : COLS - 1;
}

export function inBounds({ c, r }: Cell): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < rowWidth(r);
}

// 上下の段で隣り合う2列。奇数段は (c, c+1)、偶数段は (c-1, c)。
function diagCols(c: number, r: number): [number, number] {
  return r % 2 === 1 ? [c, c + 1] : [c - 1, c];
}

// 6方向: 0東 1北東 2北西 3西 4南西 5南東（反時計回り）
export function step({ c, r }: Cell, dir: number): Cell {
  const [a, b] = diagCols(c, r);
  switch (((dir % 6) + 6) % 6) {
    case 0:
      return { c: c + 1, r };
    case 1:
      return { c: b, r: r + 1 };
    case 2:
      return { c: a, r: r + 1 };
    case 3:
      return { c: c - 1, r };
    case 4:
      return { c: a, r: r - 1 };
    default:
      return { c: b, r: r - 1 };
  }
}

export function neighbors({ c, r }: Cell): Cell[] {
  const [a, b] = diagCols(c, r);
  const all: Cell[] = [
    { c: c - 1, r },
    { c: c + 1, r },
    { c: a, r: r - 1 },
    { c: b, r: r - 1 },
    { c: a, r: r + 1 },
    { c: b, r: r + 1 },
  ];
  return all.filter(inBounds);
}

// 下の段で支えになる2マス（左, 右）。横にはみ出す側は壁。段0は床なので空。
export function supports({ c, r }: Cell): (Cell | 'wall')[] {
  if (r === 0) return [];
  const [a, b] = diagCols(c, r);
  return [a, b].map((col) => {
    const cell = { c: col, r: r - 1 };
    return inBounds(cell) ? cell : 'wall';
  });
}
