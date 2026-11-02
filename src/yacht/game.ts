import { CATEGORIES, type Category, DICE_COUNT, type Dice, MAX_ROLLS, type Sheet, isCategory, scoreFor, total } from './rules';

export type PlayerState = { name: string; sheet: Sheet; removed: boolean };
export type YachtState = {
  players: PlayerState[];
  current: number;
  // その手番でまだ振っていなければ []
  dice: Dice;
  held: boolean[];
  rollsUsed: number;
  firstPlayer: number;
  ended: boolean;
};
export type Ranking = { seat: number; name: string; total: number; rank: number }[];

const noHolds = () => new Array<boolean>(DICE_COUNT).fill(false);
const isFull = (p: PlayerState) => CATEGORIES.every((c) => p.sheet[c] !== undefined);

// N人分のヨットの進行。乱数は外から渡し、画面・通信からは切り離してある。
export class YachtGame {
  private s: YachtState;

  constructor(names: string[], firstPlayer: number, private rng: () => number) {
    this.s = {
      players: names.map((name) => ({ name, sheet: {}, removed: false })),
      current: firstPlayer,
      dice: [],
      held: noHolds(),
      rollsUsed: 0,
      firstPlayer,
      ended: false,
    };
  }

  static restore(state: YachtState, rng: () => number): YachtGame {
    const g = new YachtGame([], 0, rng);
    g.s = structuredClone(state);
    return g;
  }

  state(): YachtState {
    return structuredClone(this.s);
  }

  private isTurn(seat: number) {
    return !this.s.ended && this.s.current === seat;
  }

  roll(seat: number): boolean {
    if (!this.isTurn(seat) || this.s.rollsUsed >= MAX_ROLLS) return false;
    const dice: Dice = [];
    for (let i = 0; i < DICE_COUNT; i++) {
      dice.push(this.s.held[i] ? this.s.dice[i] : 1 + Math.floor(this.rng() * 6));
    }
    this.s.dice = dice;
    this.s.rollsUsed++;
    return true;
  }

  toggleHold(seat: number, die: number): boolean {
    const { rollsUsed } = this.s;
    if (!this.isTurn(seat) || rollsUsed < 1 || rollsUsed >= MAX_ROLLS) return false;
    if (!Number.isInteger(die) || die < 0 || die >= DICE_COUNT) return false;
    this.s.held[die] = !this.s.held[die];
    return true;
  }

  score(seat: number, cat: Category): boolean {
    if (!this.isTurn(seat) || this.s.rollsUsed < 1 || !isCategory(cat)) return false;
    const sheet = this.s.players[seat].sheet;
    if (sheet[cat] !== undefined) return false;
    sheet[cat] = scoreFor(cat, this.s.dice);
    this.advance();
    return true;
  }

  // 戻ってこない人の番を進める。空き役の先頭に 0 点
  skip(seat: number): boolean {
    if (!this.isTurn(seat)) return false;
    const sheet = this.s.players[seat].sheet;
    const cat = CATEGORIES.find((c) => sheet[c] === undefined)!;
    sheet[cat] = 0;
    this.advance();
    return true;
  }

  remove(seat: number) {
    const p = this.s.players[seat];
    if (!p || p.removed) return;
    p.removed = true;
    for (const c of CATEGORIES) p.sheet[c] ??= 0;
    if (this.s.current === seat && !this.s.ended) this.advance();
  }

  ranking(): Ranking {
    const rows = this.s.players
      .map((p, seat) => ({ seat, name: p.name, total: total(p.sheet), rank: 0 }))
      .sort((a, b) => b.total - a.total || a.seat - b.seat);
    rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1));
    return rows;
  }

  private advance() {
    this.s.dice = [];
    this.s.held = noHolds();
    this.s.rollsUsed = 0;
    const n = this.s.players.length;
    for (let step = 1; step <= n; step++) {
      const next = (this.s.current + step) % n;
      if (!isFull(this.s.players[next])) {
        this.s.current = next;
        return;
      }
    }
    this.s.ended = true;
  }
}
