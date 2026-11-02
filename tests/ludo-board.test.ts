import { SIZE, TRACK_CELLS, baseHoles, cellOf, laneCells, startCell } from '../src/ludo/board';
import { GOAL, LAST_TRACK, START_POS, TRACK } from '../src/ludo/rules';

type P = { r: number; c: number };
const key = ({ r, c }: P) => `${r},${c}`;
const adjacent = (a: P, b: P) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

describe('盤の座標（11×11）', () => {
  test('盤は 11×11', () => {
    expect(SIZE).toBe(11);
  });

  test('1周40マスはすべて別のマスで、縦横の隣どうしがつながって輪になる', () => {
    expect(TRACK_CELLS).toHaveLength(TRACK);
    expect(new Set(TRACK_CELLS.map(key)).size).toBe(TRACK);
    TRACK_CELLS.forEach((cell, i) => expect(adjacent(cell, TRACK_CELLS[(i + 1) % TRACK])).toBe(true));
  });

  test('色の位置: 赤は左、緑は上、黄は右、青は下から出発する', () => {
    expect(startCell(0)).toEqual({ r: 4, c: 0 });
    expect(startCell(1)).toEqual({ r: 0, c: 6 });
    expect(startCell(2)).toEqual({ r: 6, c: 10 });
    expect(startCell(3)).toEqual({ r: 10, c: 4 });
    for (let color = 0; color < 4; color++) expect(cellOf(color, 0, 0)).toEqual(TRACK_CELLS[START_POS[color]]);
  });

  test('ゴールへの道は1周の最後のマスから中央へまっすぐ4マス続き、色ごとに別', () => {
    const lanes = new Set<string>();
    for (let color = 0; color < 4; color++) {
      let prev = cellOf(color, LAST_TRACK, 0);
      for (let p = LAST_TRACK + 1; p <= GOAL; p++) {
        const cell = cellOf(color, p, 0);
        expect(adjacent(prev, cell)).toBe(true);
        lanes.add(key(cell));
        prev = cell;
      }
      expect(laneCells(color)).toHaveLength(4);
    }
    expect(lanes.size).toBe(16);
  });

  test('スタートの4つのコマは、自分の陣地の4つの穴', () => {
    for (let color = 0; color < 4; color++) {
      const holes = baseHoles(color);
      expect(new Set(holes.map(key)).size).toBe(4);
      expect([0, 1, 2, 3].map((i) => cellOf(color, -1, i))).toEqual(holes);
    }
  });
});
