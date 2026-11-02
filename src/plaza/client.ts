import type { FromHub, ToHub } from './protocol';
import type { PlazaState, Table } from './state';

// 卓の中のゲームが使う送受信口。席番号で送り先・送り主を表す。
export type TableLink = {
  send(toSeat: number, m: unknown): void;
  broadcast(m: unknown): void;
  onMessage(handler: (fromSeat: number, m: unknown) => void): () => void;
};

const linkKey = (table: number, round: number) => `${table}:${round}`;

// 各参加者（親自身も含む）の受け口。親から配られた広場の状態を持ち、
// ゲームのメッセージを卓ごとの受け手に渡す。
export class PlazaClient {
  me: string | null = null;
  state: PlazaState | null = null;
  rejected: 'full' | 'name' | 'dup' | null = null;
  onChange: () => void = () => {};
  // 遊んでいる最中の卓で、ある席の人がゲームから抜けた（戻った・切断した）
  onPlayerLeft: (table: number, round: number, seat: number) => void = () => {};
  private handlers = new Map<string, Set<(from: number, m: unknown) => void>>();

  constructor(private send: (m: ToHub) => void) {}

  hello(name: string): void {
    this.send({ t: 'hello', name });
  }

  request(m: Exclude<ToHub, { t: 'hello' | 'game' }>): void {
    this.send(m);
  }

  myTable(): Table | undefined {
    return this.me ? this.state?.tables.find((t) => t.seats.includes(this.me!)) : undefined;
  }

  nameOf(id: string | null): string {
    return this.state?.members.find((m) => m.id === id)?.name ?? '（抜けた人）';
  }

  link(table: number, round: number): TableLink {
    const key = linkKey(table, round);
    return {
      send: (to, m) => this.send({ t: 'game', table, round, to, m }),
      broadcast: (m) => this.send({ t: 'game', table, round, to: 'all', m }),
      onMessage: (h) => {
        const set = this.handlers.get(key) ?? new Set();
        set.add(h);
        this.handlers.set(key, set);
        return () => {
          set.delete(h);
          if (set.size === 0) this.handlers.delete(key);
        };
      },
    };
  }

  receive(m: FromHub): void {
    switch (m.t) {
      case 'welcome':
        this.me = m.you;
        return;
      case 'rejected':
        this.rejected = m.reason;
        this.onChange();
        return;
      case 'game':
        for (const h of [...(this.handlers.get(linkKey(m.table, m.round)) ?? [])]) h(m.from, m.m);
        return;
      case 'state': {
        const prev = this.state;
        this.state = m.state;
        if (prev) this.notifyLeft(prev, m.state);
        this.onChange();
        return;
      }
    }
  }

  // 前の状態でゲームにいた席が null になっていたら知らせる
  private notifyLeft(prev: PlazaState, next: PlazaState) {
    for (const old of prev.tables) {
      if (old.status !== 'playing') continue;
      const cur = next.tables.find((t) => t.id === old.id);
      old.players.forEach((p, seat) => {
        if (p === null) return;
        const still = cur && cur.status === 'playing' && cur.round === old.round && cur.players[seat] === p;
        if (!still) this.onPlayerLeft(old.id, old.round, seat);
      });
    }
  }
}
