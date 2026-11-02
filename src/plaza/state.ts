// 広場（大人数の部屋）と、その中の卓の状態。親のブラウザだけが正しい記録を持つ。
// 通信からは切り離してあり、要求を受けて状態を変えるだけ。

export type GameId = 'six' | 'yacht' | 'hb' | 'ludo' | 'baseball';
export const GAME_IDS: GameId[] = ['six', 'yacht', 'hb', 'ludo', 'baseball'];
export const GAME_LIMITS: Record<GameId, { min: number; max: number }> = {
  six: { min: 2, max: 2 },
  hb: { min: 2, max: 2 },
  baseball: { min: 2, max: 2 },
  yacht: { min: 2, max: 6 },
  ludo: { min: 2, max: 4 },
};

export const MAX_MEMBERS = 12;
export const NAME_MAX = 12;

export type Member = { id: string; name: string };
export type Table = {
  id: number;
  game: GameId;
  // 席順の参加者。seats[0] が卓の主
  seats: string[];
  status: 'waiting' | 'playing';
  // 開始するたびに1増える。古いゲームのメッセージを見分けるのに使う
  round: number;
  // 遊んでいる最中の席ごとの参加者。戻った人・切断した人は null
  players: (string | null)[];
};
export type PlazaState = { members: Member[]; tables: Table[] };
export type JoinResult = { ok: true } | { ok: false; reason: 'full' | 'name' | 'dup' };

export function normalizeName(raw: string): string | null {
  const name = raw.trim();
  return name ? [...name].slice(0, NAME_MAX).join('') : null;
}

export class Plaza {
  private members: Member[] = [];
  private tables: Table[] = [];
  private nextTableId = 1;

  constructor(hostId: string, hostName: string) {
    this.members.push({ id: hostId, name: normalizeName(hostName) ?? 'ホスト' });
  }

  state(): PlazaState {
    return structuredClone({ members: this.members, tables: this.tables });
  }

  table(id: number): Table | undefined {
    const t = this.tables.find((x) => x.id === id);
    return t && structuredClone(t);
  }

  join(id: string, rawName: string): JoinResult {
    if (this.member(id)) return { ok: false, reason: 'dup' };
    const name = normalizeName(rawName);
    if (!name) return { ok: false, reason: 'name' };
    if (this.members.length >= MAX_MEMBERS) return { ok: false, reason: 'full' };
    this.members.push({ id, name: this.uniqueName(name) });
    return { ok: true };
  }

  // 切断。卓からも外し、遊んでいる最中ならその席を空ける
  leave(id: string): void {
    this.members = this.members.filter((m) => m.id !== id);
    const t = this.tableOf(id);
    if (!t) return;
    this.markLeftGame(t, id);
    this.removeSeat(t, id);
  }

  createTable(id: string, game: GameId): number | null {
    if (!this.member(id) || this.tableOf(id)) return null;
    const t: Table = { id: this.nextTableId++, game, seats: [id], status: 'waiting', round: 0, players: [] };
    this.tables.push(t);
    return t.id;
  }

  joinTable(id: string, tableId: number): boolean {
    const t = this.tables.find((x) => x.id === tableId);
    if (!t || !this.member(id) || this.tableOf(id)) return false;
    if (t.status !== 'waiting' || t.seats.length >= GAME_LIMITS[t.game].max) return false;
    t.seats.push(id);
    return true;
  }

  // 卓を出る（開始後は、ゲームから戻ってからでないと出られない）
  leaveTable(id: string): boolean {
    const t = this.tableOf(id);
    if (!t || t.status !== 'waiting') return false;
    this.removeSeat(t, id);
    return true;
  }

  start(id: string): boolean {
    const t = this.tableOf(id);
    if (!t || t.seats[0] !== id || t.status !== 'waiting' || t.seats.length < GAME_LIMITS[t.game].min) return false;
    t.status = 'playing';
    t.round++;
    t.players = [...t.seats];
    return true;
  }

  // ゲームから卓の画面へ戻った。round が今の開始回数でなければ無視
  leftGame(id: string, tableId: number, round: number): boolean {
    const t = this.tables.find((x) => x.id === tableId);
    if (!t || t.status !== 'playing' || t.round !== round || !t.players.includes(id)) return false;
    this.markLeftGame(t, id);
    return true;
  }

  private markLeftGame(t: Table, id: string) {
    if (t.status !== 'playing') return;
    t.players = t.players.map((p) => (p === id ? null : p));
    if (t.players.every((p) => p === null)) {
      t.status = 'waiting';
      t.players = [];
    }
  }

  private removeSeat(t: Table, id: string) {
    t.seats = t.seats.filter((s) => s !== id);
    if (t.seats.length === 0) this.tables = this.tables.filter((x) => x !== t);
  }

  private member(id: string) {
    return this.members.find((m) => m.id === id);
  }

  private tableOf(id: string) {
    return this.tables.find((t) => t.seats.includes(id));
  }

  private uniqueName(name: string) {
    const taken = new Set(this.members.map((m) => m.name));
    if (!taken.has(name)) return name;
    // 番号を付けても NAME_MAX に収まるよう、元の名前を削る
    for (let n = 2; ; n++) {
      const suffix = `(${n})`;
      const candidate = [...name].slice(0, NAME_MAX - suffix.length).join('') + suffix;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
