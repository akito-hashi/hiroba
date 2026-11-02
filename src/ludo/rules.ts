// ルドーのルール。画面・通信からは切り離してあり、乱数は外から渡す。
//
// 盤は 11×11。1周40マス、ゴールへの道4マス。
// コマの位置は「自分のスタートから何マス進んだか」で持つ。
//   -1      … スタート（盤の外の陣地）
//   0〜39   … 1周40マスの道（盤上の位置は absolutePos で求める）
//   40〜43  … 自分の色のゴールへの道。43 がゴール

export const TRACK = 40;
export const LAST_TRACK = 39;
export const GOAL = 43;
export const PIECES = 4;
// 色: 0 赤, 1 緑, 2 黄, 3 青（時計回り）。各色のスタートの盤上の位置
export const START_POS = [0, 10, 20, 30];
// 各色のスタートのマスは安全（蹴落とされない）
const SAFE = new Set(START_POS);

export type LudoPlayer = { name: string; color: number; pieces: number[]; removed: boolean };
export type LudoState = {
  players: LudoPlayer[];
  current: number;
  // 最後に出た目（まだ振っていなければ null）
  dice: number | null;
  // roll: 振る番 / move: 出た目でコマを選ぶ番
  phase: 'roll' | 'move';
  winner: number | null;
  ended: boolean;
  // 今の手番の人が、自分の6でもう一度振れるところ
  bonus: boolean;
  // これまでに振った回数（画面でサイコロを揺らすのに使う）
  rolls: number;
};
export type LudoRanking = { seat: number; name: string; rank: number }[];

// 人数ごとの色。2人は向かい合う色
export function colorsFor(n: number): number[] {
  return n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n);
}

export function absolutePos(color: number, progress: number): number {
  return (START_POS[color] + progress) % TRACK;
}

// 出た目で動かした先。動かせなければ null
export function destination(progress: number, die: number): number | null {
  if (progress === -1) return die === 6 ? 0 : null;
  if (progress === GOAL) return null;
  const to = progress + die;
  return to <= GOAL ? to : null;
}

export class LudoGame {
  private s: LudoState;

  constructor(
    names: string[],
    first: number,
    private rng: () => number,
  ) {
    const colors = colorsFor(names.length);
    this.s = {
      // 最初から全員がコマを1つずつスタートのマスに出している
      players: names.map((name, i) => ({ name, color: colors[i], pieces: [0, ...new Array(PIECES - 1).fill(-1)], removed: false })),
      current: first,
      dice: null,
      phase: 'roll',
      winner: null,
      ended: false,
      bonus: false,
      rolls: 0,
    };
  }

  static restore(state: LudoState, rng: () => number): LudoGame {
    const g = new LudoGame([], 0, rng);
    g.s = structuredClone(state);
    return g;
  }

  state(): LudoState {
    return structuredClone(this.s);
  }

  // 今の出目で動かせるコマの番号
  legalMoves(): number[] {
    const s = this.s;
    if (s.ended || s.phase !== 'move' || s.dice === null) return [];
    const pieces = s.players[s.current].pieces;
    return pieces.flatMap((p, i) => (destination(p, s.dice!) !== null ? [i] : []));
  }

  roll(seat: number): boolean {
    const s = this.s;
    if (s.ended || s.current !== seat || s.phase !== 'roll') return false;
    s.dice = Math.floor(this.rng() * 6) + 1;
    s.phase = 'move';
    s.bonus = false;
    s.rolls++;
    // 本当に何も動かせなければ、6でも振り直しなしで次の人へ
    if (this.legalMoves().length === 0) this.nextTurn();
    return true;
  }

  move(seat: number, piece: number): boolean {
    const s = this.s;
    if (s.current !== seat || !this.legalMoves().includes(piece)) return false;
    const me = s.players[seat];
    const to = destination(me.pieces[piece], s.dice!)!;
    me.pieces[piece] = to;
    if (to <= LAST_TRACK) this.capture(seat, absolutePos(me.color, to));
    if (me.pieces.every((p) => p === GOAL)) {
      s.winner = seat;
      s.ended = true;
      return true;
    }
    // 6ならもう一度振れる
    if (s.dice === 6) {
      s.phase = 'roll';
      s.bonus = true;
    } else this.nextTurn();
    return true;
  }

  // 抜けた人。コマは盤から消し、手番は飛ばす
  remove(seat: number): void {
    const p = this.s.players[seat];
    if (!p || p.removed || this.s.ended) return;
    p.removed = true;
    p.pieces = new Array(PIECES).fill(-1);
    if (this.endIfAlone()) return;
    if (this.s.current === seat) this.nextTurn();
  }

  ranking(): LudoRanking {
    const progress = (p: LudoPlayer) => p.pieces.reduce((sum, x) => sum + x + 1, 0);
    const rows = this.s.players
      .map((p, seat) => ({ seat, name: p.name, score: seat === this.s.winner ? Infinity : p.removed ? -1 : progress(p) }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat);
    // 同じ点の人は、すべて前の人と同じ順位
    const out: LudoRanking = [];
    rows.forEach((r, i) => out.push({ seat: r.seat, name: r.name, rank: i > 0 && rows[i - 1].score === r.score ? out[i - 1].rank : i + 1 }));
    return out;
  }

  private capture(seat: number, pos: number) {
    if (SAFE.has(pos)) return;
    this.s.players.forEach((p, i) => {
      if (i === seat || p.removed) return;
      p.pieces = p.pieces.map((x) => (x >= 0 && x <= LAST_TRACK && absolutePos(p.color, x) === pos ? -1 : x));
    });
  }

  private nextTurn() {
    const s = this.s;
    const n = s.players.length;
    for (let k = 1; k <= n; k++) {
      const next = (s.current + k) % n;
      if (!s.players[next].removed) {
        s.current = next;
        break;
      }
    }
    s.phase = 'roll';
    s.bonus = false;
  }

  private endIfAlone(): boolean {
    const left = this.s.players.flatMap((p, i) => (p.removed ? [] : [i]));
    if (left.length > 1) return false;
    this.s.winner = left[0] ?? null;
    this.s.ended = true;
    return true;
  }
}
