import { DANGER_ROW } from '../src/core/grid';
import { findGroups } from '../src/core/match';
import { fillNoMatch } from './helpers';
import { FALL_INTERVAL_MS, Game } from '../src/core/game';
import { pieceCells } from '../src/core/piece';

describe('Game', () => {
  test('0.8秒で1段（2段分）落ちる', () => {
    const g = new Game(1);
    const r0 = g.current.pivot.r;
    g.tick(FALL_INTERVAL_MS - 1);
    expect(g.current.pivot.r).toBe(r0);
    g.tick(1);
    expect(g.current.pivot.r).toBe(r0 - 2);
  });

  test('dt が大きくても1回でまとめて飛ばさない', () => {
    const g = new Game(1);
    const r0 = g.current.pivot.r;
    g.tick(10_000);
    expect(g.current.pivot.r).toBe(r0 - 2);
  });

  test('即落としで着地して次のピースが出る', () => {
    const g = new Game(1);
    const next = g.next;
    g.input('hardDrop');
    expect(g.board.count()).toBe(3);
    expect(g.current.colors).toEqual(next);
    expect(g.status).toBe('playing');
  });

  test('左右移動と回転', () => {
    const g = new Game(1);
    const c0 = g.current.pivot.c;
    g.input('left');
    expect(g.current.pivot.c).toBe(c0 - 1);
    const rot0 = g.current.rot;
    g.input('rotateR');
    expect(g.current.rot).toBe((rot0 + 5) % 6);
  });

  test('消すと攻撃イベントが出る', () => {
    const g = new Game(1);
    [0, 1, 2].forEach((c) => g.board.set({ c, r: 0 }, 'red'));
    g.current = { colors: ['red', 'red', 'red'], pivot: { c: 3, r: 2 }, rot: 0 };
    g.input('hardDrop');
    expect(g.drainEvents()).toContainEqual({ type: 'attack', chunks: ['single', 'single', 'single'] });
    expect(g.drainEvents()).toEqual([]);
  });

  test('消すと演出用に役と消えた位置が出る', () => {
    const g = new Game(1);
    [0, 1, 2].forEach((c) => g.board.set({ c, r: 0 }, 'red'));
    g.current = { colors: ['red', 'red', 'red'], pivot: { c: 3, r: 2 }, rot: 0 };
    g.input('hardDrop');
    const cleared = g.drainEvents().find((e) => e.type === 'cleared');
    expect(cleared?.type === 'cleared' && cleared.result.clearedCells).toHaveLength(6);
  });

  test('受けた攻撃は2手後に塊で降る', () => {
    const g = new Game(1);
    g.receiveAttack(['hexagon']);
    g.input('hardDrop');
    expect(g.board.count()).toBe(3);
    g.input('hardDrop');
    expect(g.board.count()).toBe(3 + 3 + 7);
  });

  test('おじゃまで6つ繋がったら、その場で消えて受けた側の攻撃になる', () => {
    let counterAttacks = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game(seed);
      g.receiveAttack([...new Array(3).fill('hexagon'), ...new Array(4).fill('pyramid')]);
      g.input('hardDrop');
      g.drainEvents();
      g.input('hardDrop');
      // 次の手を待たずに消えている
      expect(findGroups(g.board)).toEqual([]);
      if (g.drainEvents().some((e) => e.type === 'attack')) counterAttacks++;
    }
    expect(counterAttacks).toBeGreaterThan(0);
  });

  test('危険段まで積み上がったら負け', () => {
    const g = new Game(1);
    fillNoMatch(g.board, 0, DANGER_ROW);
    g.input('hardDrop');
    expect(g.status).toBe('lost');
    expect(g.drainEvents()).toContainEqual({ type: 'lost' });
    // 負けた後は入力を受け付けない
    const before = pieceCells(g.current);
    g.input('left');
    expect(pieceCells(g.current)).toEqual(before);
  });

  test('同じシードなら同じピース列', () => {
    const a = new Game(7);
    const b = new Game(7);
    expect([a.current.colors, a.next]).toEqual([b.current.colors, b.next]);
  });
});
