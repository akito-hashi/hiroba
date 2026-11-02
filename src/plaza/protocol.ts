import { GAME_IDS, type GameId, MAX_MEMBERS, NAME_MAX, type PlazaState, type Table } from './state';

// 卓の中の席番号の上限（ヨットの6人）
export const MAX_SEATS = 6;
const ID_MAX = 64;

// 子 → 親。子は要求を送るだけで、判定は親がする
export type ToHub =
  | { t: 'hello'; name: string }
  | { t: 'create'; game: GameId }
  | { t: 'join'; table: number }
  | { t: 'leaveTable' }
  | { t: 'start' }
  | { t: 'leftGame'; table: number; round: number }
  // 卓の中のゲームのメッセージ。to は宛先の席か全員
  | { t: 'game'; table: number; round: number; to: number | 'all'; m: unknown };

// 親 → 子
export type FromHub =
  | { t: 'welcome'; you: string }
  | { t: 'rejected'; reason: 'full' | 'name' | 'dup' }
  | { t: 'state'; state: PlazaState }
  | { t: 'game'; table: number; round: number; from: number; m: unknown };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isSeat = (v: unknown): v is number => isCount(v) && v < MAX_SEATS;
const isGame = (v: unknown): v is GameId => GAME_IDS.includes(v as GameId);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= ID_MAX;
// 名前は文字単位で数える（絵文字なども1文字）
const isName = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && [...v].length <= NAME_MAX;

// 相手から来たデータは信用せず、形を確かめてから使う
export function decodeToHub(data: unknown): ToHub | null {
  if (!isObj(data)) return null;
  switch (data.t) {
    case 'hello':
      // 長さは親で整えるが、極端に長いものはここで捨てる
      return typeof data.name === 'string' && data.name.length <= 100 ? { t: 'hello', name: data.name } : null;
    case 'create':
      return isGame(data.game) ? { t: 'create', game: data.game } : null;
    case 'join':
      return isCount(data.table) ? { t: 'join', table: data.table } : null;
    case 'leaveTable':
    case 'start':
      return { t: data.t };
    case 'leftGame':
      return isCount(data.table) && isCount(data.round) ? { t: 'leftGame', table: data.table, round: data.round } : null;
    case 'game':
      return isCount(data.table) && isCount(data.round) && (isSeat(data.to) || data.to === 'all')
        ? { t: 'game', table: data.table, round: data.round, to: data.to, m: data.m }
        : null;
    default:
      return null;
  }
}

function decodeTable(v: unknown): Table | null {
  if (!isObj(v)) return null;
  const { id, game, seats, status, round, players } = v;
  if (!isCount(id) || !isGame(game) || !isCount(round)) return null;
  if (status !== 'waiting' && status !== 'playing') return null;
  if (!Array.isArray(seats) || seats.length > MAX_SEATS || !seats.every(isId)) return null;
  if (!Array.isArray(players) || players.length > MAX_SEATS || !players.every((p) => p === null || isId(p))) return null;
  return { id, game, seats: [...seats], status, round, players: [...players] };
}

function decodeState(v: unknown): PlazaState | null {
  if (!isObj(v) || !Array.isArray(v.members) || !Array.isArray(v.tables)) return null;
  if (v.members.length > MAX_MEMBERS || !v.members.every((m) => isObj(m) && isId(m.id) && isName(m.name))) return null;
  const tables = v.tables.map(decodeTable);
  if (tables.some((t) => t === null)) return null;
  return { members: v.members.map((m) => ({ id: m.id as string, name: m.name as string })), tables: tables as Table[] };
}

export function decodeFromHub(data: unknown): FromHub | null {
  if (!isObj(data)) return null;
  switch (data.t) {
    case 'welcome':
      return isId(data.you) ? { t: 'welcome', you: data.you } : null;
    case 'rejected':
      return data.reason === 'full' || data.reason === 'name' || data.reason === 'dup' ? { t: 'rejected', reason: data.reason } : null;
    case 'state': {
      const state = decodeState(data.state);
      return state ? { t: 'state', state } : null;
    }
    case 'game':
      return isCount(data.table) && isCount(data.round) && isSeat(data.from)
        ? { t: 'game', table: data.table, round: data.round, from: data.from, m: data.m }
        : null;
    default:
      return null;
  }
}
