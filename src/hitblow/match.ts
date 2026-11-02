import { CODE_LENGTH, type Code, MAX_TURNS, type Result } from './rules';

// 0 = 先攻（部屋を作った側）, 1 = 後攻
export type Player = 0 | 1;
export type Entry = { guess: Code; result: Result };
export type Outcome = { winner: Player | 'draw'; reason: 'solved' | 'turns' | 'disconnect' | 'stalled' | 'cheat' };

const other = (p: Player): Player => (p === 0 ? 1 : 0);

// 両者のブラウザで同じ記録を順に入れ、同じ結果を得る
export class HitBlowMatch {
  private entries: [Entry[], Entry[]] = [[], []];
  private result: Outcome | null = null;

  turnOf(): Player | null {
    if (this.result) return null;
    return this.entries[0].length > this.entries[1].length ? 1 : 0;
  }

  turns(): [number, number] {
    return [this.entries[0].length, this.entries[1].length];
  }

  history(p: Player): Entry[] {
    return this.entries[p];
  }

  outcome(): Outcome | null {
    return this.result;
  }

  record(p: Player, guess: Code, result: Result): boolean {
    if (this.turnOf() !== p) return false;
    this.entries[p].push({ guess, result });
    // 先攻が当てても、後攻が同じターンを終えるまで決着しない
    if (p === 1) {
      const solved = (q: Player) => this.entries[q].at(-1)!.result.hit === CODE_LENGTH;
      if (solved(0) && solved(1)) this.result = { winner: 'draw', reason: 'solved' };
      else if (solved(0)) this.result = { winner: 0, reason: 'solved' };
      else if (solved(1)) this.result = { winner: 1, reason: 'solved' };
      else if (this.entries[1].length >= MAX_TURNS) this.result = { winner: 'draw', reason: 'turns' };
    }
    return true;
  }

  forfeit(leaver: Player, reason: 'disconnect' | 'stalled' = 'disconnect') {
    if (!this.result) this.result = { winner: other(leaver), reason };
  }

  cheated(cheater: Player) {
    this.result = { winner: other(cheater), reason: 'cheat' };
  }
}
