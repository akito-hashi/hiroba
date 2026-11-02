import { BALL_COLORS, Board } from '../src/core/board';
import { CHUNK_SIZE, GarbageQueue, chunkCells } from '../src/core/garbage';
import { neighbors } from '../src/core/grid';
import { detectRole } from '../src/core/match';
import { createRng } from '../src/core/rng';
import { fillNoMatch } from './helpers';

const rng = () => createRng(1);

describe('chunkCells', () => {
  test('塊の形は役と同じ形', () => {
    const anchor = { c: 4, r: 8 };
    expect(detectRole(chunkCells('hexagon', anchor))).toBe('hexagon');
    expect(detectRole(chunkCells('pyramid', anchor))).toBe('pyramid');
    expect(detectRole(chunkCells('straight', anchor))).toBe('straight');
    expect(chunkCells('single', anchor)).toEqual([anchor]);
  });

  test('ヘキサゴンの塊は輪6個と中心1個', () => {
    const cells = chunkCells('hexagon', { c: 4, r: 8 });
    expect(cells).toHaveLength(CHUNK_SIZE.hexagon);
    expect(cells).toEqual(expect.arrayContaining([{ c: 4, r: 8 }, ...neighbors({ c: 4, r: 8 })]));
  });
});

describe('GarbageQueue', () => {
  test('予告は2手目で、色付きの塊として降る', () => {
    const b = new Board();
    const q = new GarbageQueue();
    q.add(['hexagon', 'hexagon']);
    q.onPiecePlaced(b, rng());
    expect(b.count()).toBe(0);
    expect(q.pendingTotal()).toBe(2);
    q.onPiecePlaced(b, rng());
    expect(b.count()).toBe(14);
    expect(q.pendingTotal()).toBe(0);
    expect([...b.filled()].every((c) => BALL_COLORS.includes(b.get(c)!))).toBe(true);
  });

  test('自分の塊1つで予告の塊を1つ打ち消し、余りを返す', () => {
    const q = new GarbageQueue();
    q.add(['pyramid', 'pyramid', 'pyramid']);
    expect(q.offset(['single', 'single'])).toEqual([]);
    expect(q.pendingTotal()).toBe(1);
    expect(q.offset(['straight', 'straight'])).toEqual(['straight']);
    expect(q.pendingTotal()).toBe(0);
  });

  test('盤面が満杯なら、大量のおじゃまでもすぐ終わる', () => {
    const b = new Board();
    fillNoMatch(b, 0, 18);
    const q = new GarbageQueue();
    q.add(new Array(100_000).fill('hexagon'));
    q.onPiecePlaced(b, rng());
    const t = performance.now();
    q.onPiecePlaced(b, rng());
    expect(performance.now() - t).toBeLessThan(100);
  });

  test('満杯近くに降れば負けの状態になる', () => {
    const b = new Board();
    fillNoMatch(b, 0, 15);
    const q = new GarbageQueue();
    q.add(['straight']);
    q.onPiecePlaced(b, rng());
    q.onPiecePlaced(b, rng());
    expect(b.isOverLine()).toBe(true);
  });
});
