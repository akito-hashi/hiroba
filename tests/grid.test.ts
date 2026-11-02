import { createRng } from '../src/core/rng';
import { DANGER_ROW, ROWS, inBounds, neighbors, rowWidth, supports } from '../src/core/grid';

describe('createRng', () => {
  test('同じシードなら同じ乱数列になる', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });

  test('違うシードなら違う乱数列になる', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});

describe('grid', () => {
  test('偶数段は10マス、奇数段は9マス、見える段は16', () => {
    expect(rowWidth(0)).toBe(10);
    expect(rowWidth(1)).toBe(9);
    expect(DANGER_ROW).toBe(15);
    expect(ROWS).toBe(18);
  });

  test('盤外判定', () => {
    expect(inBounds({ c: 9, r: 0 })).toBe(true);
    expect(inBounds({ c: 9, r: 1 })).toBe(false);
    expect(inBounds({ c: -1, r: 0 })).toBe(false);
    expect(inBounds({ c: 0, r: ROWS })).toBe(false);
  });

  test('奇数段の支えは (c,r-1) と (c+1,r-1)', () => {
    expect(supports({ c: 3, r: 1 })).toEqual([
      { c: 3, r: 0 },
      { c: 4, r: 0 },
    ]);
  });

  test('偶数段の支えは (c-1,r-1) と (c,r-1)', () => {
    expect(supports({ c: 3, r: 2 })).toEqual([
      { c: 2, r: 1 },
      { c: 3, r: 1 },
    ]);
  });

  test('偶数段の端は壁が支えになる', () => {
    expect(supports({ c: 0, r: 2 })).toEqual(['wall', { c: 0, r: 1 }]);
    expect(supports({ c: 9, r: 2 })).toEqual([{ c: 8, r: 1 }, 'wall']);
  });

  test('段0は床なので支えなし', () => {
    expect(supports({ c: 0, r: 0 })).toEqual([]);
  });

  test('隣接は6方向（盤内のみ）', () => {
    const n = neighbors({ c: 3, r: 1 });
    expect(n).toHaveLength(6);
    expect(n).toEqual(
      expect.arrayContaining([
        { c: 2, r: 1 },
        { c: 4, r: 1 },
        { c: 3, r: 0 },
        { c: 4, r: 0 },
        { c: 3, r: 2 },
        { c: 4, r: 2 },
      ]),
    );
    // 偶数段左端の床: 右 (1,0) と右上 (0,1) のみ
    expect(neighbors({ c: 0, r: 0 })).toEqual([
      { c: 1, r: 0 },
      { c: 0, r: 1 },
    ]);
  });
});
