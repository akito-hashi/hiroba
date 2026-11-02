import { type FromLudoHost, type ToLudoHost, decodeFromLudoHost, decodeToLudoHost } from '../ludo/protocol';
import { LudoGame, type LudoState } from '../ludo/rules';
import type { TableLink } from '../plaza/client';

// 卓でのルドー。卓の席0が LudoGame で進行を管理し、ほかの席は操作を送って状態を受け取る。
// 色は卓の席順に割り当てる。画面からは切り離してあり、状態が変わるたびに onState を呼ぶ。
export class LudoOnline {
  // 席0（進行役）がいなくなった
  onHostLeft: () => void = () => {};
  private game: LudoGame | null = null;
  private state: LudoState | null = null;
  private off: () => void;

  constructor(
    private seat: number,
    names: string[],
    private link: TableLink,
    private onState: (state: LudoState) => void,
    rng: () => number = Math.random,
  ) {
    if (seat === 0) {
      const game = new LudoGame(names, 0, rng);
      this.game = game;
      this.off = link.onMessage((from, data) => {
        const m = decodeToLudoHost(data);
        if (!m) return;
        // 準備できた人には、今の状態を返す
        if (m.t === 'ready') return this.state && link.send(from, { t: 'state', state: this.state } satisfies FromLudoHost);
        const ok = m.t === 'roll' ? game.roll(from) : game.move(from, m.piece);
        if (ok) this.changed();
      });
      this.changed();
    } else {
      this.off = link.onMessage((from, data) => {
        const m = decodeFromLudoHost(data);
        if (from === 0 && m) this.emit(m.state);
      });
      this.toHost({ t: 'ready' });
    }
  }

  roll() {
    this.act({ t: 'roll' });
  }

  move(piece: number) {
    this.act({ t: 'move', piece });
  }

  playerLeft(seat: number) {
    if (this.game) {
      this.game.remove(seat);
      this.changed();
    } else if (seat === 0 && !this.state?.ended) {
      // 決着した後なら、進行役が抜けても結果はそのまま見せる
      this.onHostLeft();
    }
  }

  dispose() {
    this.off();
  }

  private act(m: Exclude<ToLudoHost, { t: 'ready' }>) {
    const g = this.game;
    if (!g) return this.toHost(m);
    const ok = m.t === 'roll' ? g.roll(this.seat) : g.move(this.seat, m.piece);
    if (ok) this.changed();
  }

  private toHost(m: ToLudoHost) {
    this.link.send(0, m);
  }

  private changed() {
    const state = this.game!.state();
    this.link.broadcast({ t: 'state', state } satisfies FromLudoHost);
    this.emit(state);
  }

  private emit(state: LudoState) {
    this.state = state;
    this.onState(state);
  }
}
