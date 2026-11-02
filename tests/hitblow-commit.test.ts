import { commit, randomSalt, verifyReveal } from '../src/hitblow/commit';
import { score } from '../src/hitblow/rules';

const secret = [0, 0, 3, 5];
const guesses = [
  [0, 1, 2, 3],
  [0, 0, 5, 3],
  [0, 0, 3, 5],
];
const honest = guesses.map((guess) => ({ guess, result: score(secret, guess) }));

describe('commit', () => {
  test('同じ正解と塩なら同じ封印値、塩が違えば別の値', async () => {
    const salt = randomSalt();
    expect(await commit(secret, salt)).toBe(await commit(secret, salt));
    expect(await commit(secret, salt)).not.toBe(await commit(secret, randomSalt()));
  });

  test('塩は毎回ちがう長い文字列', () => {
    const a = randomSalt();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(randomSalt());
  });
});

describe('verifyReveal', () => {
  test('正直な相手なら true', async () => {
    const salt = randomSalt();
    expect(await verifyReveal(await commit(secret, salt), secret, salt, honest)).toBe(true);
  });

  test('公開した正解が封印値と合わなければ false', async () => {
    const salt = randomSalt();
    const c = await commit(secret, salt);
    expect(await verifyReveal(c, [0, 0, 3, 4], salt, honest)).toBe(false);
    expect(await verifyReveal(c, secret, randomSalt(), honest)).toBe(false);
  });

  test('途中で嘘の判定を返していたら false', async () => {
    const salt = randomSalt();
    const lied = honest.map((e, i) => (i === 1 ? { ...e, result: { hit: 0, blow: 0 } } : e));
    expect(await verifyReveal(await commit(secret, salt), secret, salt, lied)).toBe(false);
  });

  test('公開した正解の形が不正なら false', async () => {
    const salt = randomSalt();
    expect(await verifyReveal(await commit(secret, salt), [9, 9, 9, 9], salt, [])).toBe(false);
  });
});
