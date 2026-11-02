import { createRng } from '../src/core/rng';
import { YachtGame } from '../src/yacht/game';
import { CATEGORIES, type Category } from '../src/yacht/rules';

const firstEmpty = (g: YachtGame, seat: number): Category =>
  CATEGORIES.find((c) => g.state().players[seat].sheet[c] === undefined)!;

function playTurn(g: YachtGame) {
  const seat = g.state().current;
  expect(g.roll(seat)).toBe(true);
  expect(g.score(seat, firstEmpty(g, seat))).toBe(true);
}

const game3 = () => new YachtGame(['A', 'B', 'C'], 0, createRng(1));

describe('YachtGame', () => {
  test('3人で順番に回り、12ターンで終わる', () => {
    const g = game3();
    const order: number[] = [];
    for (let i = 0; i < 36; i++) {
      expect(g.state().ended).toBe(false);
      order.push(g.state().current);
      playTurn(g);
    }
    expect(order.slice(0, 6)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(g.state().ended).toBe(true);
    expect(g.roll(g.state().current)).toBe(false);
  });

  test('先手を指定できる', () => {
    const g = new YachtGame(['A', 'B', 'C'], 2, createRng(1));
    expect(g.state().current).toBe(2);
    playTurn(g);
    expect(g.state().current).toBe(0);
  });

  test('手番でない席の操作は無視される', () => {
    const g = game3();
    const before = g.state();
    expect(g.roll(1)).toBe(false);
    expect(g.state()).toEqual(before);
    g.roll(0);
    expect(g.toggleHold(1, 0)).toBe(false);
    expect(g.score(1, 'choice')).toBe(false);
  });

  test('振る前は記入もホールドもできない', () => {
    const g = game3();
    expect(g.score(0, 'choice')).toBe(false);
    expect(g.toggleHold(0, 0)).toBe(false);
  });

  test('ホールドした目は振り直しで変わらない', () => {
    const g = game3();
    g.roll(0);
    const first = g.state().dice;
    expect(g.toggleHold(0, 0)).toBe(true);
    expect(g.toggleHold(0, 1)).toBe(true);
    for (let i = 0; i < 2; i++) {
      g.roll(0);
      expect(g.state().dice.slice(0, 2)).toEqual(first.slice(0, 2));
    }
  });

  test('4回目は振れず、3回振った後はホールドもできない', () => {
    const g = game3();
    g.roll(0);
    g.roll(0);
    g.roll(0);
    expect(g.state().rollsUsed).toBe(3);
    expect(g.roll(0)).toBe(false);
    expect(g.toggleHold(0, 0)).toBe(false);
  });

  test('知らない役には記入できない', () => {
    const g = game3();
    g.roll(0);
    expect(g.score(0, 'x' as Category)).toBe(false);
    expect(g.state().current).toBe(0);
  });

  test('埋まった役には記入できない', () => {
    const g = new YachtGame(['A'], 0, createRng(1));
    g.roll(0);
    g.score(0, 'choice');
    g.roll(0);
    expect(g.score(0, 'choice')).toBe(false);
  });

  test('記入すると振った状態がリセットされる', () => {
    const g = game3();
    g.roll(0);
    g.toggleHold(0, 2);
    g.score(0, 'choice');
    const s = g.state();
    expect(s.dice).toEqual([]);
    expect(s.held).toEqual([false, false, false, false, false]);
    expect(s.rollsUsed).toBe(0);
  });

  test('skip は手番の人の先頭の空き役に0点を入れて次へ', () => {
    const g = game3();
    playTurn(g); // A: ones
    playTurn(g); // B: ones
    playTurn(g); // C: ones
    expect(g.skip(1)).toBe(false); // 手番は A
    expect(g.skip(0)).toBe(true);
    expect(g.state().players[0].sheet.twos).toBe(0);
    expect(g.state().current).toBe(1);
  });

  test('外された人は飛ばされ、空き役が0で埋まる', () => {
    const g = game3();
    g.remove(1);
    const b = g.state().players[1];
    expect(b.removed).toBe(true);
    expect(CATEGORIES.every((c) => b.sheet[c] === 0)).toBe(true);
    playTurn(g);
    expect(g.state().current).toBe(2);
    playTurn(g);
    expect(g.state().current).toBe(0);
  });

  test('外された人が手番中なら次へ進む', () => {
    const g = game3();
    playTurn(g);
    g.roll(1);
    g.remove(1);
    expect(g.state().current).toBe(2);
    expect(g.state().rollsUsed).toBe(0);
  });

  test('最後の1人以外が外されても、残りを遊び切れば終わる', () => {
    const g = new YachtGame(['A', 'B'], 0, createRng(1));
    g.remove(1);
    for (let i = 0; i < 12; i++) playTurn(g);
    expect(g.state().ended).toBe(true);
  });

  test('同点は同順位', () => {
    const g = game3();
    const s = g.state();
    s.players[0].sheet = { choice: 20 };
    s.players[1].sheet = { choice: 25 };
    s.players[2].sheet = { choice: 20 };
    const r = YachtGame.restore(s, createRng(1)).ranking();
    expect(r.map((x) => [x.seat, x.rank, x.total])).toEqual([
      [1, 1, 25],
      [0, 2, 20],
      [2, 2, 20],
    ]);
  });

  test('restore で同じ状態から続けられる', () => {
    const g = game3();
    playTurn(g);
    g.roll(1);
    g.toggleHold(1, 3);
    const copy = YachtGame.restore(g.state(), createRng(9));
    expect(copy.state()).toEqual(g.state());
    expect(copy.roll(1)).toBe(true);
  });

  test('state はコピーなので書き換えても影響しない', () => {
    const g = game3();
    g.state().players[0].sheet.yacht = 50;
    expect(g.state().players[0].sheet.yacht).toBeUndefined();
  });
});
