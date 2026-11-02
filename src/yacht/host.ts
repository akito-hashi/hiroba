import { YachtGame, type YachtState } from './game';
import { type LobbyPlayer, MAX_PLAYERS, NAME_MAX, type ToGuest, type ToHost, decodeToHost, normalizeName } from './protocol';

// 抜けた人の番をこれだけ待ったら、親がスキップできる
export const AWAY_GRACE_MS = 30_000;

export type HostSnapshot = { seats: { token: string; name: string }[]; game: YachtState | null };
export type HostView = {
  phase: 'lobby' | 'playing' | 'ended';
  players: LobbyPlayer[];
  game: YachtState | null;
  awaySince: (number | null)[];
};

type Seat = { token: string; name: string; connId: string | null; awaySince: number | null };
type Action = Exclude<ToHost, { t: 'hello' }>;

// 親のブラウザで部屋を管理する。通信からは切り離してあり、send で接続ごとに送る。
// 親自身は席0で、接続を持たない。
export class YachtHost {
  onChange: () => void = () => {};
  private seats: Seat[];
  private game: YachtGame | null = null;

  constructor(
    hostName: string,
    hostToken: string,
    private send: (connId: string, m: ToGuest) => void,
    private rng: () => number,
    private now: () => number = Date.now,
  ) {
    this.seats = [{ token: hostToken, name: normalizeName(hostName) ?? '親', connId: null, awaySince: null }];
  }

  // 親がページを開き直したとき。子は入り直してくるまでオフライン扱い
  static restore(snap: HostSnapshot, send: (connId: string, m: ToGuest) => void, rng: () => number, now: () => number = Date.now): YachtHost {
    const [first, ...rest] = snap.seats;
    const h = new YachtHost(first.name, first.token, send, rng, now);
    for (const s of rest) h.seats.push({ ...s, connId: null, awaySince: now() });
    h.game = snap.game ? YachtGame.restore(snap.game, rng) : null;
    return h;
  }

  snapshot(): HostSnapshot {
    return { seats: this.seats.map(({ token, name }) => ({ token, name })), game: this.game?.state() ?? null };
  }

  view(): HostView {
    const game = this.game?.state() ?? null;
    return {
      phase: !game ? 'lobby' : game.ended ? 'ended' : 'playing',
      players: this.seats.map((s, i) => ({ name: s.name, online: i === 0 || s.connId !== null })),
      game,
      awaySince: this.seats.map((s) => s.awaySince),
    };
  }

  hello(connId: string, token: string, rawName: string) {
    // 1つの接続が持てる席は1つだけ
    const current = this.seatOf(connId);
    if (current >= 0) return;
    const known = this.seats.findIndex((s) => s.token === token);
    if (known > 0) {
      // 入り直し。古い接続は以後無視する
      this.seats[known].connId = connId;
      this.seats[known].awaySince = null;
      this.send(connId, { t: 'welcome', seat: known });
      this.changed();
      return;
    }
    if (known === 0) return;
    const name = normalizeName(rawName);
    if (!name) return;
    if (this.game) return this.send(connId, { t: 'rejected', reason: 'started' });
    if (this.seats.length >= MAX_PLAYERS) return this.send(connId, { t: 'rejected', reason: 'full' });
    this.seats.push({ token, name: this.uniqueName(name), connId, awaySince: null });
    this.send(connId, { t: 'welcome', seat: this.seats.length - 1 });
    this.changed();
  }

  leave(connId: string) {
    const seat = this.seatOf(connId);
    if (seat < 0) return;
    this.seats[seat].connId = null;
    this.seats[seat].awaySince = this.now();
    this.changed();
  }

  // 子から届いたデータをそのまま渡す。形を確かめてから使う
  receive(connId: string, data: unknown) {
    const m = decodeToHost(data);
    if (!m) return;
    if (m.t === 'hello') return this.hello(connId, m.token, m.name);
    const seat = this.seatOf(connId);
    if (seat > 0) this.act(seat, m);
  }

  hostAction(m: Action) {
    this.act(0, m);
  }

  start(): boolean {
    if (this.game || this.seats.length < 2) return false;
    this.game = new YachtGame(
      this.seats.map((s) => s.name),
      0,
      this.rng,
    );
    this.changed();
    return true;
  }

  canSkip(): boolean {
    const g = this.game?.state();
    if (!g || g.ended) return false;
    const away = this.seats[g.current].awaySince;
    return away !== null && this.now() - away >= AWAY_GRACE_MS;
  }

  skip(): boolean {
    if (!this.game || !this.canSkip()) return false;
    this.game.skip(this.game.state().current);
    this.changed();
    return true;
  }

  remove(seat: number): boolean {
    const g = this.game?.state();
    if (!this.game || !g || g.ended || seat <= 0 || seat >= this.seats.length || g.players[seat].removed) return false;
    this.game.remove(seat);
    this.changed();
    return true;
  }

  // 外された人を除いた同じメンバーで、先手を1つずらして始め直す
  rematch(): boolean {
    const g = this.game?.state();
    if (!g || !g.ended) return false;
    const keep = this.seats.filter((_, i) => !g.players[i].removed);
    const prevFirst = this.seats[g.firstPlayer];
    this.seats = keep;
    keep.forEach((s, i) => s.connId && this.send(s.connId, { t: 'welcome', seat: i }));
    // 前回の先手の次の人（前回の先手が外されていたら、その位置にいる人）
    const at = keep.indexOf(prevFirst);
    const first = at >= 0 ? (at + 1) % keep.length : g.firstPlayer % keep.length;
    this.game = new YachtGame(
      keep.map((s) => s.name),
      first,
      this.rng,
    );
    this.changed();
    return true;
  }

  private act(seat: number, m: Action) {
    if (!this.game) return;
    const ok =
      m.t === 'roll' ? this.game.roll(seat) : m.t === 'hold' ? this.game.toggleHold(seat, m.die) : this.game.score(seat, m.category);
    if (ok) this.changed();
  }

  private seatOf(connId: string) {
    return this.seats.findIndex((s) => s.connId === connId);
  }

  // 重複したら「名前(2)」。印を付けても NAME_MAX 文字に収まるよう本体を削る
  private uniqueName(name: string) {
    const taken = new Set(this.seats.map((s) => s.name));
    if (!taken.has(name)) return name;
    const chars = [...name];
    for (let n = 2; ; n++) {
      const suffix = `(${n})`;
      const candidate = chars.slice(0, NAME_MAX - suffix.length).join('') + suffix;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // 変わるたびに、つながっている全員へ最新の状態を送る
  private changed() {
    const v = this.view();
    const msg: ToGuest = v.game
      ? { t: 'state', state: v.game, online: v.players.map((p) => p.online), awaySince: v.awaySince }
      : { t: 'lobby', players: v.players };
    for (const s of this.seats) if (s.connId) this.send(s.connId, msg);
    this.onChange();
  }
}
