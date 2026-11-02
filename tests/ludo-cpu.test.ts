import { createRng } from '../src/core/rng';
import { decideLudo } from '../src/ludo/cpu';
import { LudoGame } from '../src/ludo/rules';
import type { CpuLevel } from '../src/games/types';

// 状態を直接作って試す
function gameWith(pieces: number[][], die: number) {
  const g = new LudoGame(
    pieces.map((_, i) => `p${i}`),
    0,
    () => (die - 1) / 6 + 0.01,
  );
  const s = g.state();
  pieces.forEach((p, i) => (s.players[i].pieces = [...p]));
  const h = LudoGame.restore(s, () => (die - 1) / 6 + 0.01);
  h.roll(0);
  return h;
}

// 1人だけ level、ほかは weak の4人戦を最後まで。勝った席を返す
function play(levels: CpuLevel[], seed: number): number {
  const rng = createRng(seed);
  const g = new LudoGame(levels.map((_, i) => `p${i}`), seed % 4, rng);
  for (let i = 0; i < 5000 && !g.state().ended; i++) {
    const s = g.state();
    const a = decideLudo(s, levels[s.current], rng);
    if (a.type === 'roll') g.roll(s.current);
    else g.move(s.current, a.piece);
  }
  return g.state().winner ?? -1;
}

describe('decideLudo', () => {
  test.each<CpuLevel>(['weak', 'normal', 'strong'])('%s は必ず動かせるコマを選ぶ', (level) => {
    const g = gameWith([[10, 20, -1, -1], [-1, -1, -1, -1]], 6);
    const a = decideLudo(g.state(), level, createRng(1));
    expect(a.type).toBe('move');
    expect(g.legalMoves()).toContain(a.type === 'move' ? a.piece : -1);
  });

  test('振る番なら振る', () => {
    const g = new LudoGame(['a', 'b'], 0, Math.random);
    expect(decideLudo(g.state(), 'strong', Math.random)).toEqual({ type: 'roll' });
  });

  test.each<CpuLevel>(['normal', 'strong'])('%s は蹴落とせるときに蹴落とす', (level) => {
    // 赤のコマ1 (5→9) は何もなし、コマ0 (10→14) で黄(p=34 → 盤上14)を蹴落とせる
    const g = gameWith([[10, 5, -1, -1], [34, -1, -1, -1]], 4);
    expect(decideLudo(g.state(), level, createRng(2))).toEqual({ type: 'move', piece: 0 });
  });

  test('つよいは、よわい3人を相手に勝ちやすい', () => {
    let wins = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) if (play(['strong', 'weak', 'weak', 'weak'], seed) === 0) wins++;
    // 4人なので、強さに差がなければ 1/4 程度
    expect(wins / N).toBeGreaterThan(0.4);
  });
});
