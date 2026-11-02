import { createRng } from '../src/core/rng';
import { type CpuLevel, decideCpu } from '../src/yacht/cpu';
import { YachtGame, type YachtState } from '../src/yacht/game';
import { CATEGORIES, total } from '../src/yacht/rules';

const LEVELS: CpuLevel[] = ['weak', 'normal', 'strong'];

function stateWith(partial: Partial<YachtState>): YachtState {
  return { ...new YachtGame(['CPU'], 0, createRng(1)).state(), ...partial };
}

// CPU 1人で最後まで遊ばせて合計点を返す
function playSolo(level: CpuLevel, seed: number): number {
  const rng = createRng(seed);
  const g = new YachtGame(['CPU'], 0, rng);
  for (let steps = 0; !g.state().ended; steps++) {
    if (steps > 1000) throw new Error('終わらない');
    const a = decideCpu(g.state(), 0, level, rng);
    if (a.type === 'roll') expect(g.roll(0)).toBe(true);
    else if (a.type === 'score') expect(g.score(0, a.category)).toBe(true);
    else {
      const held = g.state().held;
      expect(a.held).not.toEqual(held);
      a.held.forEach((h, i) => h !== held[i] && g.toggleHold(0, i));
    }
  }
  return total(g.state().players[0].sheet);
}

describe('decideCpu', () => {
  test.each(LEVELS)('%s: 最初は必ず振る', (level) => {
    expect(decideCpu(stateWith({}), 0, level, createRng(1))).toEqual({ type: 'roll' });
  });

  test.each(['normal', 'strong'] as const)('%s: ヨットが揃っていてヨットが空いていれば記入', (level) => {
    const s = stateWith({ dice: [6, 6, 6, 6, 6], rollsUsed: 1 });
    expect(decideCpu(s, 0, level, createRng(1))).toEqual({ type: 'score', category: 'yacht' });
  });

  test.each(LEVELS)('%s: 3回振ったら必ず空き役に記入する', (level) => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = stateWith({ dice: [1, 3, 3, 5, 6], rollsUsed: 3 });
      s.players[0].sheet = { ones: 1, choice: 20 };
      const a = decideCpu(s, 0, level, createRng(seed));
      expect(a.type).toBe('score');
      if (a.type === 'score') expect(['ones', 'choice']).not.toContain(a.category);
    }
  });

  test.each(LEVELS)('%s: 残り1役ならその役を選ぶ', (level) => {
    const s = stateWith({ dice: [1, 2, 4, 5, 6], rollsUsed: 3 });
    for (const c of CATEGORIES) if (c !== 'fullHouse') s.players[0].sheet[c] = 0;
    expect(decideCpu(s, 0, level, createRng(1))).toEqual({ type: 'score', category: 'fullHouse' });
  });

  test.each(LEVELS)('%s: 最後まで遊び切れる', (level) => {
    expect(playSolo(level, 7)).toBeGreaterThanOrEqual(0);
  });

  test('強さの順に平均点が高い', () => {
    const games = 40;
    const avg = (level: CpuLevel) => {
      let sum = 0;
      for (let seed = 1; seed <= games; seed++) sum += playSolo(level, seed);
      return sum / games;
    };
    const weak = avg('weak');
    const normal = avg('normal');
    const strong = avg('strong');
    expect(normal).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(normal);
  }, 30_000);
});
