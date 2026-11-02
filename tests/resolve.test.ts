import { Board, type Color } from '../src/core/board';
import { resolve } from '../src/core/resolve';

function put(b: Board, color: Color, cells: [number, number][]) {
  cells.forEach(([c, r]) => b.set({ c, r }, color));
}

const times = <T>(x: T, n: number) => new Array<T>(n).fill(x);

describe('resolve', () => {
  test('役ができるとその色が盤上から全部消え、役の塊を送る', () => {
    const b = new Board();
    put(b, 'red', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [9, 0]]);
    const result = resolve(b);
    expect(result.roles).toEqual(['straight']);
    expect(result.chunks).toEqual(times('straight', 2));
    expect(result.clearedCells).toHaveLength(7);
    expect(b.count()).toBe(0);
  });

  test('役なし7個なら単体ボール4個', () => {
    const b = new Board();
    put(b, 'red', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1]]);
    const result = resolve(b);
    expect(result.roles).toEqual([]);
    expect(result.chunks).toEqual(times('single', 4));
    expect(result.chains).toBe(1);
  });

  test('連鎖の攻撃をまとめる', () => {
    const b = new Board();
    put(b, 'blue', [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [0, 4]]);
    put(b, 'red', [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3]]);
    const result = resolve(b);
    // 1連鎖目: 赤6（役なし）=単体3、2連鎖目: 落ちた青で横一列 = ストレート
    expect(result.chains).toBe(2);
    expect(result.roles).toEqual(['straight']);
    expect(result.chunks).toEqual([...times('single', 3), ...times('straight', 2)]);
    expect(b.count()).toBe(0);
  });

  test('何も消えなければ攻撃なし', () => {
    const b = new Board();
    put(b, 'red', [[0, 0]]);
    expect(resolve(b)).toEqual({ chunks: [], chains: 0, roles: [], clearedCells: [] });
  });
});
