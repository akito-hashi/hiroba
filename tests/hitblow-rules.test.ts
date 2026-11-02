import { CODE_LENGTH, COLOR_COUNT, isValidCode, score } from '../src/hitblow/rules';

describe('score', () => {
  test.each([
    [[0, 1, 2, 3], [0, 1, 2, 3], { hit: 4, blow: 0 }],
    [[0, 1, 2, 3], [3, 2, 1, 0], { hit: 0, blow: 4 }],
    [[0, 1, 2, 3], [4, 5, 4, 5], { hit: 0, blow: 0 }],
    [[0, 1, 2, 3], [0, 2, 4, 5], { hit: 1, blow: 1 }],
  ])('同じ色がないとき %j に %j → %j', (secret, guess, expected) => {
    expect(score(secret, guess)).toEqual(expected);
  });

  test.each([
    // ヒットに使った玉はブローに数えない
    [[0, 0, 1, 2], [0, 1, 0, 0], { hit: 1, blow: 2 }],
    [[0, 0, 0, 0], [0, 0, 0, 1], { hit: 3, blow: 0 }],
    [[0, 1, 1, 1], [1, 0, 0, 0], { hit: 0, blow: 2 }],
    [[1, 1, 2, 2], [2, 2, 1, 1], { hit: 0, blow: 4 }],
    [[0, 1, 2, 3], [0, 0, 0, 0], { hit: 1, blow: 0 }],
  ])('同じ色が重なるとき %j に %j → %j', (secret, guess, expected) => {
    expect(score(secret, guess)).toEqual(expected);
  });
});

describe('isValidCode', () => {
  test('6色から4つ、同じ色も可', () => {
    expect(CODE_LENGTH).toBe(4);
    expect(COLOR_COUNT).toBe(6);
    expect(isValidCode([0, 1, 2, 5])).toBe(true);
    expect(isValidCode([3, 3, 3, 3])).toBe(true);
  });

  test.each([
    ['長さが短い', [0, 1, 2]],
    ['長さが長い', [0, 1, 2, 3, 4]],
    ['範囲外の色', [0, 1, 2, 6]],
    ['負の数', [0, 1, 2, -1]],
    ['小数', [0, 1, 2, 1.5]],
    ['文字列の要素', [0, 1, 2, '3']],
    ['配列でない', '0123'],
    ['null', null],
  ])('不正な入力は false: %s', (_, code) => {
    expect(isValidCode(code)).toBe(false);
  });
});
