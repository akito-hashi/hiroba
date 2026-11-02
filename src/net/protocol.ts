import { BALL_COLORS, type Color } from '../core/board';
import type { Triple } from '../core/game';
import { COLS, ROWS, type Cell } from '../core/grid';
import type { ChunkShape } from '../core/resolve';

// 0 = 部屋を作った側（ホスト）, 1 = 参加した側（ゲスト）
export type NetMsg =
  | { t: 'start'; seed: number }
  | { t: 'snapshot'; cells: (Color | null)[]; piece: { cells: Cell[]; colors: Triple } | null; next: Triple; pending: number }
  | { t: 'attack'; chunks: ChunkShape[] }
  | { t: 'lost' }
  | { t: 'roundEnd'; winner: 0 | 1 | 'draw' }
  | { t: 'rematch' }
  | { t: 'ping' };

// 1回に送る塊の数の上限（大連鎖でも届かない大きさ）
export const MAX_CHUNKS = 100;
const COLORS = new Set<unknown>(BALL_COLORS);
const SHAPES = new Set<unknown>(['hexagon', 'pyramid', 'straight', 'single']);

export function encode(msg: NetMsg): unknown {
  return msg;
}

const isNonNegInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isColor = (v: unknown): v is Color => COLORS.has(v);
const isTriple = (v: unknown): v is Triple => Array.isArray(v) && v.length === 3 && v.every(isColor);
const isCell = (v: unknown): v is Cell =>
  typeof v === 'object' && v !== null && Number.isInteger((v as Cell).c) && Number.isInteger((v as Cell).r);

function decodeSnapshot(m: Record<string, unknown>): NetMsg | null {
  const { cells, piece, next, pending } = m;
  if (!Array.isArray(cells) || cells.length !== ROWS * COLS || !cells.every((c) => c === null || isColor(c))) return null;
  if (!isTriple(next) || !isNonNegInt(pending)) return null;
  let p: { cells: Cell[]; colors: Triple } | null = null;
  if (piece !== null) {
    const raw = piece as { cells?: unknown; colors?: unknown };
    if (typeof piece !== 'object' || !Array.isArray(raw.cells) || raw.cells.length !== 3 || !raw.cells.every(isCell)) return null;
    if (!isTriple(raw.colors)) return null;
    p = { cells: raw.cells.map(({ c, r }) => ({ c, r })), colors: raw.colors };
  }
  return { t: 'snapshot', cells: cells as (Color | null)[], piece: p, next, pending: pending as number };
}

// 相手から来たデータは信用せず、形を確かめてから使う
export function decode(data: unknown): NetMsg | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case 'start':
      return isNonNegInt(m.seed) ? { t: 'start', seed: m.seed as number } : null;
    case 'attack':
      return Array.isArray(m.chunks) && m.chunks.length > 0 && m.chunks.length <= MAX_CHUNKS && m.chunks.every((s) => SHAPES.has(s))
        ? { t: 'attack', chunks: m.chunks as ChunkShape[] }
        : null;
    case 'lost':
    case 'rematch':
    case 'ping':
      return { t: m.t };
    case 'roundEnd':
      return m.winner === 0 || m.winner === 1 || m.winner === 'draw' ? { t: 'roundEnd', winner: m.winner } : null;
    case 'snapshot':
      return decodeSnapshot(m);
    default:
      return null;
  }
}
