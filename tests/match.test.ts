import { Board } from '../src/core/board';
import { type Cell, neighbors, step } from '../src/core/grid';
import { detectRole, findGroups } from '../src/core/match';

function line(start: Cell, dir: number, n: number): Cell[] {
  const cells = [start];
  for (let i = 1; i < n; i++) cells.push(step(cells[i - 1], dir));
  return cells;
}

describe('detectRole', () => {
  test('3方向のストレート', () => {
    expect(detectRole(line({ c: 0, r: 0 }, 0, 6))).toBe('straight');
    expect(detectRole(line({ c: 0, r: 0 }, 1, 6))).toBe('straight');
    expect(detectRole(line({ c: 6, r: 0 }, 2, 6))).toBe('straight');
  });

  test('上向きピラミッド（3・2・1）', () => {
    const a = { c: 2, r: 0 };
    const group = [a, step(a, 0), step(step(a, 0), 0), step(a, 1), step(step(a, 1), 0), step(step(a, 1), 1)];
    expect(detectRole(group)).toBe('pyramid');
  });

  test('下向きピラミッド（1・2・3 を逆さに）', () => {
    const a = { c: 2, r: 4 };
    const group = [a, step(a, 0), step(step(a, 0), 0), step(a, 5), step(step(a, 5), 0), step(step(a, 5), 5)];
    expect(detectRole(group)).toBe('pyramid');
  });

  test('ヘキサゴン（中心の周り6つ）', () => {
    expect(detectRole(neighbors({ c: 3, r: 5 }))).toBe('hexagon');
  });

  test('形の崩れた6個は役なし', () => {
    const group = [...line({ c: 0, r: 0 }, 0, 5), { c: 0, r: 1 }];
    expect(detectRole(group)).toBeNull();
  });
});

describe('findGroups', () => {
  test('同色6つ以上の繋がりだけを返す', () => {
    const b = new Board();
    line({ c: 0, r: 0 }, 0, 6).forEach((c) => b.set(c, 'red'));
    line({ c: 0, r: 1 }, 0, 5).forEach((c) => b.set(c, 'blue'));
    const groups = findGroups(b);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(6);
  });

  test('5個では消えない', () => {
    const b = new Board();
    line({ c: 0, r: 0 }, 0, 5).forEach((c) => b.set(c, 'red'));
    expect(findGroups(b)).toEqual([]);
  });
});
