import type { TableLink } from '../plaza/client';
import type { YachtState } from '../yacht/game';
import { YachtHost } from '../yacht/host';
import { type ToHost, decodeToGuest, decodeToHost } from '../yacht/protocol';
import type { Category } from '../yacht/rules';

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
const connOf = (tableSeat: number) => `s${tableSeat}`;
const seatOfConn = (conn: string) => Number(conn.slice(1));

// 卓でのヨット。卓の席0が YachtHost で進行を管理し、ほかの席は操作を送って状態を受け取る。
// 画面からは切り離してあり、状態が変わるたびに onState を呼ぶ。
export class YachtOnline {
  // 席0（進行役）がいなくなった
  onHostLeft: () => void = () => {};
  // 全員そろう前に誰かが抜けて、始められなくなった
  cancelled = false;
  private host: YachtHost | null = null;
  // 卓の席 → ヨットの席（参加順に決まる）
  private yachtSeat = new Map<number, number>();
  private mySeat = -1;
  private state: YachtState | null = null;
  private off: () => void;

  constructor(
    seat: number,
    names: string[],
    private link: TableLink,
    private onState: (state: YachtState | null, mySeat: number) => void,
  ) {
    if (seat === 0) {
      const host = new YachtHost(
        names[0],
        randomToken(),
        (conn, m) => {
          const to = seatOfConn(conn);
          if (m.t === 'welcome') this.yachtSeat.set(to, m.seat);
          link.send(to, m);
        },
        Math.random,
      );
      this.host = host;
      this.yachtSeat.set(0, 0);
      host.onChange = () => this.emit(host.view().game, 0);
      this.off = link.onMessage((from, data) => {
        const m = decodeToHost(data);
        if (!m) return;
        host.receive(connOf(from), m);
        // 全員の hello がそろったら始める
        if (m.t === 'hello' && host.view().phase === 'lobby' && host.view().players.length === names.length) host.start();
      });
    } else {
      this.off = link.onMessage((from, data) => {
        const m = decodeToGuest(data);
        if (from !== 0 || !m) return;
        if (m.t === 'welcome') this.mySeat = m.seat;
        if (m.t === 'state') this.emit(m.state, this.mySeat);
      });
      this.toHost({ t: 'hello', token: randomToken(), name: names[seat] });
    }
  }

  roll() {
    this.act({ t: 'roll' });
  }

  hold(die: number) {
    this.act({ t: 'hold', die });
  }

  score(category: Category) {
    this.act({ t: 'score', category });
  }

  // 終わった後、同じメンバーでもう一度（進行役だけ）
  rematch() {
    this.host?.rematch();
  }

  isHost() {
    return this.host !== null;
  }

  playerLeft(tableSeat: number) {
    if (!this.host) {
      // 始まる前に誰かが抜けたら、全員そろわないので始まらない
      if (!this.state) this.cancelled = true;
      // 決着した後なら、進行役が抜けても結果はそのまま見せる
      else if (tableSeat === 0 && !this.state.ended) this.onHostLeft();
      return;
    }
    if (!this.state) {
      this.cancelled = true;
      return;
    }
    const ys = this.yachtSeat.get(tableSeat);
    if (ys !== undefined) this.host.remove(ys);
  }

  dispose() {
    this.off();
  }

  private act(m: Exclude<ToHost, { t: 'hello' }>) {
    if (this.host) this.host.hostAction(m);
    else this.toHost(m);
  }

  private toHost(m: ToHost) {
    this.link.send(0, m);
  }

  private emit(state: YachtState | null, mySeat: number) {
    this.state = state;
    this.onState(state, mySeat);
  }
}
