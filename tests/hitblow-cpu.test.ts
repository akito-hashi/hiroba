import { type HbCpuLevel, CpuHbPlayer, chooseGuess } from '../src/hitblow/cpu';
import type { Entry } from '../src/hitblow/match';
import type { HbMsg } from '../src/hitblow/protocol';
import { type Code, CODE_LENGTH, isValidCode, score } from '../src/hitblow/rules';
import { HbSession } from '../src/hitblow/session';
import { createRng } from '../src/core/rng';

// secret を相手にしたときの推測の手数（当てるまで）
function solveTurns(secret: Code, level: HbCpuLevel, seed: number): number {
  const rng = createRng(seed);
  const history: Entry[] = [];
  for (let turn = 1; turn <= 20; turn++) {
    const guess = chooseGuess(history, level, rng);
    const result = score(secret, guess);
    if (result.hit === CODE_LENGTH) return turn;
    history.push({ guess, result });
  }
  return 99;
}

describe('chooseGuess', () => {
  test.each<HbCpuLevel>(['weak', 'normal', 'strong'])('%s は正しい形の推測を返す', (level) => {
    expect(isValidCode(chooseGuess([], level, createRng(1)))).toBe(true);
  });

  test('ふつうは、これまでの結果と矛盾しない推測をする', () => {
    const history: Entry[] = [{ guess: [0, 1, 2, 3], result: { hit: 1, blow: 1 } }];
    const g = chooseGuess(history, 'normal', createRng(2));
    expect(score(g, [0, 1, 2, 3])).toEqual({ hit: 1, blow: 1 });
  });

  test('つよいは平均6手以内で当てる', () => {
    const rng = createRng(9);
    const secrets = Array.from({ length: 30 }, () => Array.from({ length: CODE_LENGTH }, () => Math.floor(rng() * 6)));
    const turns = secrets.map((s, i) => solveTurns(s, 'strong', i));
    expect(Math.max(...turns)).toBeLessThanOrEqual(10);
    expect(turns.reduce((a, b) => a + b, 0) / turns.length).toBeLessThanOrEqual(6);
  });

  test('つよいの1手は 200ms 以内', () => {
    const t = performance.now();
    chooseGuess([{ guess: [0, 0, 1, 1], result: { hit: 0, blow: 1 } }], 'strong', createRng(3));
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('CpuHbPlayer', () => {
  test('人間側の HbSession と最後まで対戦でき、判定の照合も通る', async () => {
    // 人間役も CPU に操作させて、決着まで進める
    let human!: HbSession;
    const cpu = new CpuHbPlayer('normal', (m: HbMsg) => void human.receive(m), { delayMs: 0, seed: 4 });
    human = new HbSession(0, (m) => cpu.receive(m));
    await human.setSecret([1, 2, 3, 4]);
    const brain = createRng(5);
    for (let i = 0; i < 200 && human.view().phase !== 'ended'; i++) {
      if (human.view().myTurn) human.guess(chooseGuess(human.view().myHistory, 'normal', brain));
      await new Promise((r) => setTimeout(r, 0));
    }
    const v = human.view();
    expect(v.phase).toBe('ended');
    expect(v.outcome?.reason).not.toBe('cheat');
    expect(v.oppSecret).not.toBeNull();
    cpu.dispose();
  });
});
