import type { Cell } from '../core/grid';
import type { Role } from '../core/match';
import type { ResolveResult } from '../core/resolve';

export const EFFECT_MS = 1100;

const ROLE_LABEL: Record<Role, string> = {
  hexagon: 'ヘキサゴン！',
  pyramid: 'ピラミッド！',
  straight: 'ストレート！',
};
const ROLE_ORDER: Role[] = ['hexagon', 'pyramid', 'straight'];

// progress は 0（出た瞬間）〜 1（消える直前）
export type ActiveEffect = { cells: Cell[]; label: string | null; progress: number };

// 消えたボールの光とテロップ。ゲームの進行は止めず、見た目だけ重ねる。
export class Effects {
  private list: { cells: Cell[]; label: string | null; born: number }[] = [];

  add(result: ResolveResult, now: number): void {
    const best = ROLE_ORDER.find((r) => result.roles.includes(r));
    this.list.push({ cells: result.clearedCells, label: best ? ROLE_LABEL[best] : null, born: now });
  }

  active(now: number): ActiveEffect[] {
    this.list = this.list.filter((e) => now - e.born < EFFECT_MS);
    return this.list.map((e) => ({ cells: e.cells, label: e.label, progress: (now - e.born) / EFFECT_MS }));
  }
}
