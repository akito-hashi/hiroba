import type { Game } from '../core/game';
import type { Piece } from '../core/piece';
import { createRng } from '../core/rng';
import { type CpuLevel, type CpuMove, cpuChooseMove } from './cpu';

// 1操作ごとの間隔（ミリ秒）。弱いほど遅い。
const ACTION_INTERVAL: Record<CpuLevel, number> = { weak: 450, normal: 220, strong: 90 };
// 目標に届かないまま操作し続けないための上限
const MAX_STEPS = 12;

// CPU の Game を、人間と同じ入力（移動・回転・落下）で操作する
export class CpuController {
  private target: CpuMove | null = null;
  private forColors: Piece['colors'] | null = null;
  private timer = 0;
  private steps = 0;
  private rng: () => number;

  constructor(
    private game: Game,
    private level: CpuLevel,
    seed: number,
  ) {
    this.rng = createRng(seed ^ 0x5eed);
  }

  tick(dtMs: number): void {
    const g = this.game;
    if (g.status !== 'playing') return;
    // 移動や落下でピースのオブジェクトは作り直されるが、色の配列は出現から着地まで同じ
    if (this.forColors !== g.current.colors) this.planFor(g.current);
    this.timer += dtMs;
    if (this.timer < ACTION_INTERVAL[this.level]) return;
    this.timer = 0;
    this.act();
  }

  private planFor(piece: Piece): void {
    const g = this.game;
    this.target = cpuChooseMove(g.board, piece.colors, g.next, this.level, this.rng);
    this.forColors = piece.colors;
    this.steps = 0;
    g.input('softDropOff');
  }

  private act(): void {
    const g = this.game;
    const t = this.target!;
    const cur = g.current;
    this.steps++;
    if (this.steps > MAX_STEPS) {
      g.input('hardDrop');
    } else if (cur.rot !== t.rot) {
      // 近い方向に回す
      const diff = (t.rot - cur.rot + 6) % 6;
      g.input(diff <= 3 ? 'rotateL' : 'rotateR');
    } else if (cur.pivot.c !== t.c) {
      g.input(cur.pivot.c < t.c ? 'right' : 'left');
    } else if (this.level === 'weak') {
      g.input('softDropOn');
    } else {
      g.input('hardDrop');
    }
  }
}
