import { PITCH_KINDS, type PitchKind, type Steer, type Vec } from './field';
import type { PitchResult } from './rules';

// n は試合の中での投球番号（1から）。古いメッセージを見分ける
export type BbMsg =
  | { t: 'pitch'; n: number; kind: PitchKind } // 投手 → 打者
  | { t: 'steer'; n: number; dir: Steer } // 投手 → 打者
  | { t: 'result'; n: number; result: PitchResult; launch: Vec | null }; // 打者 → 投手。打たなかった・空振りは null

const RESULTS: PitchResult[] = ['ball', 'strike', 'foul', 'single', 'double', 'triple', 'homer', 'out'];
const LAUNCH_MAX = 1000; // simulateHit が止まらなくなる値を弾くための上限

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isLaunch = (v: unknown): v is Vec => {
  if (typeof v !== 'object' || v === null) return false;
  const { x, y } = v as Record<string, unknown>;
  const ok = (c: unknown): c is number => typeof c === 'number' && Number.isFinite(c) && Math.abs(c) <= LAUNCH_MAX;
  return ok(x) && ok(y);
};

// 相手から来たデータは信用せず、形を確かめてから使う
export function decodeBb(data: unknown): BbMsg | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (!isCount(m.n)) return null;
  switch (m.t) {
    case 'pitch':
      return PITCH_KINDS.includes(m.kind as PitchKind) ? { t: 'pitch', n: m.n, kind: m.kind as PitchKind } : null;
    case 'steer':
      return m.dir === -1 || m.dir === 0 || m.dir === 1 ? { t: 'steer', n: m.n, dir: m.dir } : null;
    case 'result': {
      if (!RESULTS.includes(m.result as PitchResult)) return null;
      if (m.launch === null) return { t: 'result', n: m.n, result: m.result as PitchResult, launch: null };
      if (!isLaunch(m.launch)) return null;
      return { t: 'result', n: m.n, result: m.result as PitchResult, launch: { x: m.launch.x, y: m.launch.y } };
    }
    default:
      return null;
  }
}
