import { Board, type Color } from '../src/core/board';
import { Game, simulatePlacement } from '../src/core/game';
import { SPAWN_PIVOT, canPlace } from '../src/core/piece';
import { Score } from '../src/core/score';
import { type CpuLevel, cpuChooseMove } from '../src/cpu/cpu';

function put(b: Board, color: Color, cells: [number, number][]) {
  cells.forEach(([c, r]) => b.set({ c, r }, color));
}

describe('cpuChooseMove', () => {
  test.each<CpuLevel>(['weak', 'normal', 'strong'])('%s は必ず置ける手を返す', (level) => {
    const g = new Game(3);
    const move = cpuChooseMove(g.board, g.current.colors, g.next, level, () => 0.5);
    expect(canPlace({ ...g.current, pivot: { c: move.c, r: g.current.pivot.r }, rot: move.rot }, g.board)).toBe(true);
  });

  test('つよいはヘキサゴンを完成できる盤面でその手を選ぶ', () => {
    const b = new Board();
    put(b, 'red', [[3, 0], [4, 0], [2, 1], [4, 1]]);
    put(b, 'yellow', [[2, 0], [5, 0], [3, 1]]);
    const colors: [Color, Color, Color] = ['blue', 'red', 'red'];
    const move = cpuChooseMove(b, colors, ['yellow', 'yellow', 'purple'], 'strong', () => 0.5);
    const { result } = simulatePlacement(b, { colors, pivot: { c: move.c, r: SPAWN_PIVOT.r }, rot: move.rot });
    expect(result.roles).toContain('hexagon');
  });
});

describe('cpuChooseMove の速さ', () => {
  test('つよいの思考でも1手 30ms 以内（画面が止まらない）', () => {
    const g = new Game(3);
    // 中盤らしく少し積んだ盤面で測る
    for (let i = 0; i < 6; i++) g.input('hardDrop');
    cpuChooseMove(g.board, g.current.colors, g.next, 'strong', () => 0.5); // ウォームアップ
    // 他のテストと同時に走ると遅くなるので、5回のうち最速で判定する
    const times = Array.from({ length: 5 }, () => {
      const t = performance.now();
      cpuChooseMove(g.board, g.current.colors, g.next, 'strong', () => 0.5);
      return performance.now() - t;
    });
    expect(Math.min(...times)).toBeLessThan(30);
  });
});

describe('Score', () => {
  test('3本先取で勝者が決まる', () => {
    const s = new Score();
    s.record(0);
    s.record(0);
    expect(s.winner()).toBeNull();
    s.record(1);
    s.record(0);
    expect(s.wins).toEqual([3, 1]);
    expect(s.winner()).toBe(0);
  });

  test('同時に負けたら引き分けでどちらにも数えない', () => {
    const s = new Score();
    s.record('draw');
    expect(s.wins).toEqual([0, 0]);
  });
});
