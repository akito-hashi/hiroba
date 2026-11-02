import { GOAL, LAST_TRACK, START_POS, absolutePos } from './rules';

// 11×11 の盤での位置（小数も使う）。赤（色0）は左上の陣地から左の道へ出る。
// 緑・黄・青は、赤の位置を時計回りに 90° ずつ回した位置にいる。
export type Cell = { r: number; c: number };
export const SIZE = 11;

const line = (r0: number, c0: number, r1: number, c1: number): Cell[] => {
  const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  return Array.from({ length: n + 1 }, (_, i) => ({ r: r0 + Math.sign(r1 - r0) * i, c: c0 + Math.sign(c1 - c0) * i }));
};

// 1周40マス。盤上の位置 0 は赤のスタート (4,0) で、時計回りに並ぶ
export const TRACK_CELLS: Cell[] = [
  ...line(4, 0, 4, 4),
  ...line(3, 4, 0, 4),
  { r: 0, c: 5 },
  ...line(0, 6, 4, 6),
  ...line(4, 7, 4, 10),
  { r: 5, c: 10 },
  ...line(6, 10, 6, 6),
  ...line(7, 6, 10, 6),
  { r: 10, c: 5 },
  ...line(10, 4, 6, 4),
  ...line(6, 3, 6, 0),
  { r: 5, c: 0 },
];

// 赤から見た位置を、色の数だけ時計回りに回す
const rotate = ({ r, c }: Cell, times: number): Cell => {
  let cell = { r, c };
  for (let i = 0; i < times; i++) cell = { r: cell.c, c: SIZE - 1 - cell.r };
  return cell;
};

// 赤の陣地（左上の角の丸い四角）の4つの穴
const RED_HOLES: Cell[] = [
  { r: 0.9, c: 0.9 },
  { r: 0.9, c: 2.1 },
  { r: 2.1, c: 0.9 },
  { r: 2.1, c: 2.1 },
];

export function baseHoles(color: number): Cell[] {
  return RED_HOLES.map((h) => rotate(h, color));
}

// その色のコマが progress にいるときの位置。スタートのコマは piece 番号で陣地の穴が決まる
export function cellOf(color: number, progress: number, piece: number): Cell {
  if (progress === -1) return baseHoles(color)[piece];
  if (progress <= LAST_TRACK) return TRACK_CELLS[absolutePos(color, progress)];
  // ゴールへの道 (5,1)〜(5,4)。(5,4) がゴール
  return rotate({ r: 5, c: progress - LAST_TRACK }, color);
}

export function startCell(color: number): Cell {
  return TRACK_CELLS[START_POS[color]];
}

// ゴールへの入口（1周の最後のマス）
export function entryCell(color: number): Cell {
  return TRACK_CELLS[absolutePos(color, LAST_TRACK)];
}

export function laneCells(color: number): Cell[] {
  return Array.from({ length: GOAL - LAST_TRACK }, (_, i) => rotate({ r: 5, c: i + 1 }, color));
}
