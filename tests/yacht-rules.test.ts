import { CATEGORIES, type Sheet, scoreFor, total, upperBonus } from '../src/yacht/rules';

describe('scoreFor', () => {
  test.each([
    ['ones', [1, 1, 3, 4, 1], 3],
    ['sixes', [6, 6, 2, 6, 5], 18],
    ['choice', [1, 2, 3, 4, 6], 16],
    ['fourDice', [5, 5, 5, 5, 2], 22],
    ['fourDice', [5, 5, 5, 5, 5], 25],
    ['fourDice', [5, 5, 5, 2, 2], 0],
    ['fullHouse', [2, 2, 3, 3, 3], 13],
    ['fullHouse', [4, 4, 4, 4, 4], 0],
    ['fullHouse', [2, 2, 3, 3, 4], 0],
    ['sStraight', [1, 2, 3, 4, 6], 15],
    ['sStraight', [3, 4, 5, 6, 3], 15],
    ['sStraight', [1, 2, 3, 5, 6], 0],
    ['bStraight', [2, 3, 4, 5, 6], 30],
    ['bStraight', [1, 2, 3, 4, 6], 0],
    ['yacht', [3, 3, 3, 3, 3], 50],
    ['yacht', [3, 3, 3, 3, 2], 0],
  ] as const)('%s %j → %i', (cat, dice, expected) => {
    expect(scoreFor(cat, [...dice])).toBe(expected);
  });

  test('役は12個', () => {
    expect(CATEGORIES).toHaveLength(12);
  });
});

describe('ボーナスと合計', () => {
  test('1〜6の目の合計が63以上で35点', () => {
    const sheet: Sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    expect(upperBonus(sheet)).toBe(35);
    expect(total(sheet)).toBe(63 + 35);
  });

  test('62点ならボーナスなし', () => {
    const sheet: Sheet = { ones: 2, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, yacht: 50 };
    expect(upperBonus(sheet)).toBe(0);
    expect(total(sheet)).toBe(62 + 50);
  });
});
