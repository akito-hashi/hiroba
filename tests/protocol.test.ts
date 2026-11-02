import type { Color } from '../src/core/board';
import { COLS, ROWS } from '../src/core/grid';
import { MAX_CHUNKS, type NetMsg, decode, encode } from '../src/net/protocol';

const fullCells = Array.from({ length: ROWS * COLS }, (_, i) => (i % 3 === 0 ? 'red' : null)) as (Color | null)[];

describe('protocol', () => {
  const samples: NetMsg[] = [
    { t: 'start', seed: 123 },
    { t: 'attack', chunks: ['hexagon', 'pyramid', 'straight', 'single'] },
    { t: 'lost' },
    { t: 'roundEnd', winner: 'draw' },
    { t: 'roundEnd', winner: 1 },
    { t: 'rematch' },
    { t: 'ping' },
    {
      t: 'snapshot',
      cells: fullCells,
      piece: {
        cells: [
          { c: 1, r: 2 },
          { c: 2, r: 2 },
          { c: 1, r: 3 },
        ],
        colors: ['red', 'blue', 'yellow'],
      },
      next: ['purple', 'purple', 'red'],
      pending: 3,
    },
  ];

  test.each(samples)('送って受け取ったら中身が変わらない: $t', (msg) => {
    expect(decode(JSON.parse(JSON.stringify(encode(msg))))).toEqual(msg);
  });

  test('知らない形のデータは null', () => {
    expect(decode(null)).toBeNull();
    expect(decode({ t: 'hack' })).toBeNull();
    expect(decode({ t: 'attack', chunks: 'many' })).toBeNull();
    expect(decode({ t: 'attack', chunks: ['circle'] })).toBeNull();
    expect(decode({ t: 'attack', chunks: [] })).toBeNull();
    expect(decode('lost')).toBeNull();
  });

  test('塊が多すぎるデータは null', () => {
    expect(decode({ t: 'attack', chunks: new Array(MAX_CHUNKS + 1).fill('single') })).toBeNull();
  });

  test('灰色はもう使わない', () => {
    expect(decode({ ...snap, cells: fullCells.map((c) => (c ? 'gray' : c)) })).toBeNull();
  });

  const snap = { t: 'snapshot', cells: fullCells, piece: null, next: ['red', 'red', 'red'], pending: 0 };
  test.each([
    ['知らない色', { ...snap, cells: fullCells.map((c) => (c ? 'pink' : c)) }],
    ['プロトタイプの名前', { ...snap, cells: fullCells.map((c) => (c ? 'constructor' : c)) }],
    ['長さが違う盤面', { ...snap, cells: ['red'] }],
    ['空の next', { ...snap, next: [] }],
    ['中身のない piece', { ...snap, piece: {} }],
    ['座標が数でない piece', { ...snap, piece: { cells: [{ c: 'a', r: 0 }, { c: 0, r: 0 }, { c: 0, r: 0 }], colors: ['red', 'red', 'red'] } }],
  ])('壊れた snapshot は null: %s', (_, data) => {
    expect(decode(data)).toBeNull();
  });
});
