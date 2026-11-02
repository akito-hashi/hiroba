import type { ResolveResult } from '../src/core/resolve';
import { EFFECT_MS, Effects } from '../src/ui/effects';

const result = (over: Partial<ResolveResult>): ResolveResult => ({
  chunks: [],
  chains: 1,
  roles: [],
  clearedCells: [{ c: 0, r: 0 }],
  ...over,
});

describe('Effects', () => {
  test('役ができたらテロップを出し、時間が経つと消える', () => {
    const fx = new Effects();
    fx.add(result({ roles: ['hexagon'] }), 1000);
    const [e] = fx.active(1000);
    expect(e.label).toBe('ヘキサゴン！');
    expect(e.progress).toBe(0);
    expect(fx.active(1000 + EFFECT_MS / 2)[0].progress).toBeCloseTo(0.5);
    expect(fx.active(1000 + EFFECT_MS)).toEqual([]);
  });

  test('役なしは光るだけでテロップなし', () => {
    const fx = new Effects();
    fx.add(result({}), 0);
    expect(fx.active(0)[0].label).toBeNull();
  });

  test('役が複数なら一番強い役を表示', () => {
    const fx = new Effects();
    fx.add(result({ roles: ['straight', 'hexagon', 'pyramid'] }), 0);
    expect(fx.active(0)[0].label).toBe('ヘキサゴン！');
  });
});
