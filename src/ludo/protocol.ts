import { NAME_MAX } from '../plaza/state';
import { GOAL, type LudoPlayer, type LudoState, PIECES } from './rules';

// 席0（進行役）へ。操作の要求だけを送り、判定は進行役がする
export type ToLudoHost = { t: 'ready' } | { t: 'roll' } | { t: 'move'; piece: number };
// 席0から
export type FromLudoHost = { t: 'state'; state: LudoState };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export function decodeToLudoHost(data: unknown): ToLudoHost | null {
  if (!isObj(data)) return null;
  if (data.t === 'ready' || data.t === 'roll') return { t: data.t };
  if (data.t === 'move' && isInt(data.piece, 0, PIECES - 1)) return { t: 'move', piece: data.piece };
  return null;
}

function decodePlayer(v: unknown): LudoPlayer | null {
  if (!isObj(v)) return null;
  const { name, color, pieces, removed } = v;
  if (typeof name !== 'string' || name.length === 0 || [...name].length > NAME_MAX) return null;
  if (!isInt(color, 0, 3) || typeof removed !== 'boolean') return null;
  if (!Array.isArray(pieces) || pieces.length !== PIECES || !pieces.every((p) => isInt(p, -1, GOAL))) return null;
  return { name, color, pieces: [...pieces], removed };
}

// 相手から来たデータは信用せず、形を確かめてから使う
export function decodeLudoState(v: unknown): LudoState | null {
  if (!isObj(v) || !Array.isArray(v.players) || v.players.length < 2 || v.players.length > 4) return null;
  const players = v.players.map(decodePlayer);
  if (players.some((p) => p === null)) return null;
  const n = players.length;
  const { current, dice, phase, winner, ended, bonus, rolls } = v;
  if (!isInt(current, 0, n - 1) || typeof ended !== 'boolean' || typeof bonus !== 'boolean') return null;
  if (!isInt(rolls, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (dice !== null && !isInt(dice, 1, 6)) return null;
  if (phase !== 'roll' && phase !== 'move') return null;
  if (winner !== null && !isInt(winner, 0, n - 1)) return null;
  return { players: players as LudoPlayer[], current, dice, phase, winner, ended, bonus, rolls };
}

export function decodeFromLudoHost(data: unknown): FromLudoHost | null {
  if (!isObj(data) || data.t !== 'state') return null;
  const state = decodeLudoState(data.state);
  return state ? { t: 'state', state } : null;
}
