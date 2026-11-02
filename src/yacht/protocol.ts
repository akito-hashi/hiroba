import type { PlayerState, YachtState } from './game';
import { type Category, DICE_COUNT, MAX_ROLLS, type Sheet, isCategory, isDice } from './rules';

export const MAX_PLAYERS = 6;
export const NAME_MAX = 12;

export type LobbyPlayer = { name: string; online: boolean };
// 子 → 親。子は操作の要求だけを送り、判定は親がする
export type ToHost =
  | { t: 'hello'; token: string; name: string }
  | { t: 'roll' }
  | { t: 'hold'; die: number }
  | { t: 'score'; category: Category };
// 親 → 子
export type ToGuest =
  | { t: 'welcome'; seat: number }
  | { t: 'lobby'; players: LobbyPlayer[] }
  | { t: 'state'; state: YachtState; online: boolean[]; awaySince: (number | null)[] }
  | { t: 'rejected'; reason: 'started' | 'full' | 'closed' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isToken = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
// 絵文字も1文字と数える（normalizeName と同じ数え方）
const isName = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && [...v].length <= NAME_MAX;

export function normalizeName(raw: string): string | null {
  const name = raw.trim();
  return name ? [...name].slice(0, NAME_MAX).join('') : null;
}

// 相手から来たデータは信用せず、形を確かめてから使う
export function decodeToHost(data: unknown): ToHost | null {
  if (!isObj(data)) return null;
  switch (data.t) {
    case 'hello': {
      const name = typeof data.name === 'string' ? normalizeName(data.name) : null;
      return isToken(data.token) && name ? { t: 'hello', token: data.token, name } : null;
    }
    case 'roll':
      return { t: 'roll' };
    case 'hold':
      return isInt(data.die, 0, DICE_COUNT - 1) ? { t: 'hold', die: data.die } : null;
    case 'score':
      return isCategory(data.category) ? { t: 'score', category: data.category } : null;
    default:
      return null;
  }
}

function decodeSheet(v: unknown): Sheet | null {
  if (!isObj(v)) return null;
  const sheet: Sheet = {};
  for (const [k, n] of Object.entries(v)) {
    if (!isCategory(k) || !isInt(n, 0, 50)) return null;
    sheet[k] = n;
  }
  return sheet;
}

function decodeState(v: unknown): YachtState | null {
  if (!isObj(v) || !Array.isArray(v.players)) return null;
  const n = v.players.length;
  if (n < 1 || n > MAX_PLAYERS) return null;
  const players: PlayerState[] = [];
  for (const p of v.players) {
    if (!isObj(p) || !isName(p.name) || typeof p.removed !== 'boolean') return null;
    const sheet = decodeSheet(p.sheet);
    if (!sheet) return null;
    players.push({ name: p.name, sheet, removed: p.removed });
  }
  const { current, dice, held, rollsUsed, firstPlayer, ended } = v;
  if (!isInt(current, 0, n - 1) || !isInt(firstPlayer, 0, n - 1) || !isInt(rollsUsed, 0, MAX_ROLLS)) return null;
  if (!Array.isArray(dice) || (dice.length !== 0 && !isDice(dice))) return null;
  if (!Array.isArray(held) || held.length !== DICE_COUNT || !held.every((h) => typeof h === 'boolean')) return null;
  if (typeof ended !== 'boolean') return null;
  return { players, current, dice: [...dice], held: [...held], rollsUsed, firstPlayer, ended };
}

export function decodeToGuest(data: unknown): ToGuest | null {
  if (!isObj(data)) return null;
  switch (data.t) {
    case 'welcome':
      return isInt(data.seat, 0, MAX_PLAYERS - 1) ? { t: 'welcome', seat: data.seat } : null;
    case 'lobby': {
      const { players } = data;
      if (!Array.isArray(players) || players.length > MAX_PLAYERS) return null;
      if (!players.every((p) => isObj(p) && isName(p.name) && typeof p.online === 'boolean')) return null;
      return { t: 'lobby', players: players.map((p) => ({ name: p.name, online: p.online })) };
    }
    case 'state': {
      const state = decodeState(data.state);
      if (!state) return null;
      const n = state.players.length;
      const { online, awaySince } = data;
      if (!Array.isArray(online) || online.length !== n || !online.every((o) => typeof o === 'boolean')) return null;
      if (!Array.isArray(awaySince) || awaySince.length !== n || !awaySince.every((a) => a === null || isInt(a, 0, Number.MAX_SAFE_INTEGER)))
        return null;
      return { t: 'state', state, online: [...online], awaySince: [...awaySince] };
    }
    case 'rejected':
      return ['started', 'full', 'closed'].includes(data.reason as string)
        ? { t: 'rejected', reason: data.reason as 'started' | 'full' | 'closed' }
        : null;
    default:
      return null;
  }
}
