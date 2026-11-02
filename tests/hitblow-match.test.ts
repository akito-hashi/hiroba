import { HitBlowMatch } from '../src/hitblow/match';
import { MAX_TURNS } from '../src/hitblow/rules';

const miss = { hit: 0, blow: 1 };
const solved = { hit: 4, blow: 0 };
const g = [0, 1, 2, 3];

// 両者が外し続けて n ターンずつ進める
function playMisses(m: HitBlowMatch, n: number) {
  for (let i = 0; i < n; i++) {
    expect(m.record(0, g, miss)).toBe(true);
    expect(m.record(1, g, miss)).toBe(true);
  }
}

describe('HitBlowMatch', () => {
  test('先攻（0）から交互に推測する', () => {
    const m = new HitBlowMatch();
    expect(m.turnOf()).toBe(0);
    expect(m.record(1, g, miss)).toBe(false);
    expect(m.record(0, g, miss)).toBe(true);
    expect(m.turnOf()).toBe(1);
    expect(m.record(0, g, miss)).toBe(false);
    expect(m.record(1, g, miss)).toBe(true);
    expect(m.turnOf()).toBe(0);
    expect(m.turns()).toEqual([1, 1]);
  });

  test('履歴に推測と結果が残る', () => {
    const m = new HitBlowMatch();
    m.record(0, [5, 5, 5, 5], miss);
    expect(m.history(0)).toEqual([{ guess: [5, 5, 5, 5], result: miss }]);
    expect(m.history(1)).toEqual([]);
  });

  test('先攻が当てても、後攻に同じターンの最終チャンスがある', () => {
    const m = new HitBlowMatch();
    playMisses(m, 2);
    m.record(0, g, solved);
    expect(m.outcome()).toBeNull();
    expect(m.turnOf()).toBe(1);
    m.record(1, g, miss);
    expect(m.outcome()).toEqual({ winner: 0, reason: 'solved' });
  });

  test('先攻と後攻が同じターンで当てたら引き分け', () => {
    const m = new HitBlowMatch();
    m.record(0, g, solved);
    m.record(1, g, solved);
    expect(m.outcome()).toEqual({ winner: 'draw', reason: 'solved' });
  });

  test('後攻が先に当てたら後攻の勝ち', () => {
    const m = new HitBlowMatch();
    playMisses(m, 3);
    m.record(0, g, miss);
    m.record(1, g, solved);
    expect(m.outcome()).toEqual({ winner: 1, reason: 'solved' });
  });

  test(`両者 ${MAX_TURNS} ターン外したら引き分け`, () => {
    const m = new HitBlowMatch();
    playMisses(m, MAX_TURNS - 1);
    m.record(0, g, miss);
    expect(m.outcome()).toBeNull();
    m.record(1, g, miss);
    expect(m.outcome()).toEqual({ winner: 'draw', reason: 'turns' });
  });

  test('決着後は推測を受け付けない', () => {
    const m = new HitBlowMatch();
    m.record(0, g, solved);
    m.record(1, g, miss);
    expect(m.turnOf()).toBeNull();
    expect(m.record(0, g, miss)).toBe(false);
  });

  test('途中で抜けたら残った側の勝ち', () => {
    const m = new HitBlowMatch();
    m.record(0, g, miss);
    m.forfeit(0);
    expect(m.outcome()).toEqual({ winner: 1, reason: 'disconnect' });
    expect(m.turnOf()).toBeNull();
  });

  test('決着後に抜けても結果は変わらない', () => {
    const m = new HitBlowMatch();
    m.record(0, g, solved);
    m.record(1, g, solved);
    m.forfeit(1);
    expect(m.outcome()).toEqual({ winner: 'draw', reason: 'solved' });
  });

  test('判定のズルが見つかったら相手の勝ちに上書きする', () => {
    const m = new HitBlowMatch();
    m.record(0, g, solved);
    m.record(1, g, miss);
    m.cheated(0);
    expect(m.outcome()).toEqual({ winner: 1, reason: 'cheat' });
  });
});
