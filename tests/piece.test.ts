import { Board } from '../src/core/board';
import { DANGER_ROW, neighbors, step } from '../src/core/grid';
import { type Piece, canPlace, moveDown, moveH, pieceCells, rotate, spawnPiece } from '../src/core/piece';

const sameCell = (a: { c: number; r: number }, b: { c: number; r: number }) => a.c === b.c && a.r === b.r;

describe('step', () => {
  test('奇数段の6方向', () => {
    const p = { c: 3, r: 5 };
    expect([0, 1, 2, 3, 4, 5].map((d) => step(p, d))).toEqual([
      { c: 4, r: 5 },
      { c: 4, r: 6 },
      { c: 3, r: 6 },
      { c: 2, r: 5 },
      { c: 3, r: 4 },
      { c: 4, r: 4 },
    ]);
  });

  test('偶数段の6方向', () => {
    const p = { c: 3, r: 4 };
    expect([0, 1, 2, 3, 4, 5].map((d) => step(p, d))).toEqual([
      { c: 4, r: 4 },
      { c: 3, r: 5 },
      { c: 2, r: 5 },
      { c: 2, r: 4 },
      { c: 2, r: 3 },
      { c: 3, r: 3 },
    ]);
  });
});

describe('piece', () => {
  const base: Piece = { colors: ['red', 'blue', 'yellow'], pivot: { c: 3, r: 6 }, rot: 0 };

  test('6回回すと元に戻る', () => {
    const b = new Board();
    let p = base;
    for (let i = 0; i < 6; i++) p = rotate(p, 1, b);
    expect(p).toEqual(base);
  });

  test('3つのボールは互いに隣接している（全向き・両パリティ）', () => {
    for (const r of [5, 6]) {
      for (let rot = 0; rot < 6; rot++) {
        const cells = pieceCells({ ...base, pivot: { c: 3, r }, rot });
        for (let i = 0; i < 3; i++) {
          for (let j = i + 1; j < 3; j++) {
            expect(neighbors(cells[i]).some((n) => sameCell(n, cells[j]))).toBe(true);
          }
        }
      }
    }
  });

  test('壁際の回転は1マスずれる', () => {
    const b = new Board();
    // 偶数段 c=0 で rot0（東,北東）→ rot1（北東,北西）にすると北西が壁にはみ出す
    const p: Piece = { ...base, pivot: { c: 0, r: 6 }, rot: 0 };
    expect(canPlace(p, b)).toBe(true);
    const rotated = rotate(p, 1, b);
    expect(rotated.rot).toBe(1);
    expect(canPlace(rotated, b)).toBe(true);
    expect(rotated.pivot.c).toBe(1);
  });

  test('ずらしても無理なら回転しない', () => {
    const b = new Board();
    const p: Piece = { ...base, pivot: { c: 3, r: 6 }, rot: 0 };
    // ピース自身以外の周囲を全部埋める
    const own = pieceCells(p);
    for (let r = 3; r <= 9; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = { c, r };
        if (!own.some((o) => sameCell(o, cell))) {
          try {
            b.set(cell, 'red');
          } catch {
            /* 奇数段の右端は盤外 */
          }
        }
      }
    }
    expect(rotate(p, 1, b)).toEqual(p);
  });

  test('左右移動は盤外や他のボールで止まる', () => {
    const b = new Board();
    const p: Piece = { ...base, pivot: { c: 0, r: 6 }, rot: 0 };
    expect(moveH(p, -1, b)).toBeNull();
    expect(moveH(p, 1, b)?.pivot).toEqual({ c: 1, r: 6 });
  });

  test('下移動は2段ずつ、床で止まる', () => {
    const b = new Board();
    const p: Piece = { ...base, pivot: { c: 3, r: 2 }, rot: 0 };
    expect(moveDown(p, b)?.pivot).toEqual({ c: 3, r: 0 });
    expect(moveDown({ ...p, pivot: { c: 3, r: 0 } }, b)).toBeNull();
  });

  test('出現位置は盤面上部の上向き三角', () => {
    const p = spawnPiece(['red', 'red', 'blue']);
    const cells = pieceCells(p);
    expect(cells.every((c) => c.r > DANGER_ROW)).toBe(true);
    expect(canPlace(p, new Board())).toBe(true);
  });
});
