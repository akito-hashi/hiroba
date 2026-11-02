import type { FromHub, ToHub } from './protocol';
import { Plaza } from './state';

// 親自身の参加者 ID。子の ID は接続 ID をそのまま使う
export const HOST_ID = 'host';

// 親のブラウザで動く中継役。子の要求を Plaza に反映し、状態を全員へ配り、
// 卓の中のゲームのメッセージを宛先の席へ中継する。親自身の操作も同じ道筋で処理する。
export class Hub {
  private plaza: Plaza;
  private conns = new Map<string, (m: FromHub) => void>();
  // hello を済ませて広場にいる接続
  private joined = new Set<string>();

  constructor(
    hostName: string,
    private toHost: (m: FromHub) => void,
  ) {
    this.plaza = new Plaza(HOST_ID, hostName);
  }

  // 親自身の受け口がそろってから呼ぶ
  start(): void {
    this.toHost({ t: 'welcome', you: HOST_ID });
    this.toHost({ t: 'state', state: this.plaza.state() });
  }

  addConnection(id: string, send: (m: FromHub) => void): void {
    this.conns.set(id, send);
  }

  removeConnection(id: string): void {
    this.conns.delete(id);
    if (!this.joined.delete(id)) return;
    this.plaza.leave(id);
    this.broadcast();
  }

  receive(id: string, m: ToHub): void {
    if (m.t === 'hello') {
      if (this.joined.has(id)) return;
      const r = this.plaza.join(id, m.name);
      const send = this.conns.get(id);
      if (!r.ok) return send?.({ t: 'rejected', reason: r.reason });
      this.joined.add(id);
      send?.({ t: 'welcome', you: id });
      this.broadcast();
      return;
    }
    if (this.joined.has(id)) this.handle(id, m);
  }

  hostRequest(m: ToHub): void {
    if (m.t !== 'hello') this.handle(HOST_ID, m);
  }

  private handle(id: string, m: Exclude<ToHub, { t: 'hello' }>) {
    if (m.t === 'game') return this.relay(id, m);
    const changed =
      m.t === 'create'
        ? this.plaza.createTable(id, m.game) !== null
        : m.t === 'join'
          ? this.plaza.joinTable(id, m.table)
          : m.t === 'leaveTable'
            ? this.plaza.leaveTable(id)
            : m.t === 'start'
              ? this.plaza.start(id)
              : this.plaza.leftGame(id, m.table, m.round);
    if (changed) this.broadcast();
  }

  // 遊んでいる最中の卓で、送り主と宛先がともにまだゲームにいるときだけ中継する
  private relay(id: string, m: Extract<ToHub, { t: 'game' }>) {
    const t = this.plaza.table(m.table);
    if (!t || t.status !== 'playing' || t.round !== m.round) return;
    const from = t.players.indexOf(id);
    if (from < 0) return;
    const targets = m.to === 'all' ? t.players.filter((p, i) => p !== null && i !== from) : [t.players[m.to]];
    for (const target of targets) {
      if (target) this.sendTo(target, { t: 'game', table: m.table, round: m.round, from, m: m.m });
    }
  }

  private sendTo(id: string, m: FromHub) {
    if (id === HOST_ID) this.toHost(m);
    else this.conns.get(id)?.(m);
  }

  // 子に先に配り、親自身は最後。親の画面は受け取った瞬間にゲームを開いて送ることがあり、
  // 先に親へ渡すと、子に状態より先にゲームのメッセージが届いて捨てられてしまう。
  private broadcast() {
    const msg: FromHub = { t: 'state', state: this.plaza.state() };
    for (const id of this.joined) this.conns.get(id)?.(msg);
    this.toHost(msg);
  }
}
