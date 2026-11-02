import { BALL_COLORS, Board } from '../src/core/board';
import { DANGER_ROW, rowWidth } from '../src/core/grid';

function fillRow(b: Board, r: number, except: number[] = []) {
  for (let c = 0; c < rowWidth(r); c++) {
    if (!except.includes(c)) b.set({ c, r }, 'red');
  }
}

describe('Board.settle', () => {
  test('片側だけ支えがあるボールは空いた側へ滑る', () => {
    const b = new Board();
    b.set({ c: 3, r: 0 }, 'red');
    b.set({ c: 3, r: 1 }, 'blue');
    b.settle();
    expect(b.get({ c: 3, r: 1 })).toBeNull();
    expect(b.get({ c: 4, r: 0 })).toBe('blue');
  });

  test('下が両方空いていれば r-2 へ落ちる', () => {
    const b = new Board();
    b.set({ c: 2, r: 4 }, 'blue');
    b.settle();
    expect(b.get({ c: 2, r: 0 })).toBe('blue');
    expect(b.count()).toBe(1);
  });

  test('両方の支えがあれば止まる', () => {
    const b = new Board();
    b.set({ c: 3, r: 0 }, 'red');
    b.set({ c: 4, r: 0 }, 'red');
    b.set({ c: 3, r: 1 }, 'blue');
    b.settle();
    expect(b.get({ c: 3, r: 1 })).toBe('blue');
  });

  test('壁も支えになる', () => {
    const b = new Board();
    fillRow(b, 0);
    fillRow(b, 1);
    b.set({ c: 0, r: 2 }, 'blue'); // 左は壁、右は (0,1)
    b.settle();
    expect(b.get({ c: 0, r: 2 })).toBe('blue');
  });

  test('何段も連続して滑り落ちる', () => {
    const b = new Board();
    fillRow(b, 0);
    b.set({ c: 3, r: 1 }, 'red');
    b.set({ c: 3, r: 3 }, 'blue');
    b.settle();
    // (3,3) → (3,1) が埋まっているので左の支え (3,2) → (2,1) へ滑って止まる
    expect(b.get({ c: 2, r: 1 })).toBe('blue');
    expect(b.count()).toBe(12);
  });
});

describe('Board.isOverLine', () => {
  test('危険段にボールがあれば true', () => {
    const b = new Board();
    expect(b.isOverLine()).toBe(false);
    b.set({ c: 0, r: DANGER_ROW }, 'red');
    expect(b.isOverLine()).toBe(true);
  });
});

describe('BALL_COLORS', () => {
  test('本家と同じ6種類', () => {
    expect([...BALL_COLORS].sort()).toEqual(['blue', 'green', 'orange', 'purple', 'red', 'yellow']);
  });
});

describe('Board.clone', () => {
  test('複製は元の盤面と独立している', () => {
    const b = new Board();
    b.set({ c: 0, r: 0 }, 'red');
    const copy = b.clone();
    copy.set({ c: 0, r: 0 }, null);
    expect(b.get({ c: 0, r: 0 })).toBe('red');
  });
});
