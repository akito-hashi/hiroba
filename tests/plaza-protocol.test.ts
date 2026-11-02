import { type FromHub, type ToHub, decodeFromHub, decodeToHub } from '../src/plaza/protocol';
import type { PlazaState } from '../src/plaza/state';

const roundTrip = <T>(v: T) => JSON.parse(JSON.stringify(v));

describe('子 → 親', () => {
  const samples: ToHub[] = [
    { t: 'hello', name: 'たろう' },
    { t: 'create', game: 'yacht' },
    { t: 'join', table: 3 },
    { t: 'leaveTable' },
    { t: 'start' },
    { t: 'leftGame', table: 3, round: 2 },
    { t: 'game', table: 3, round: 2, to: 1, m: { t: 'roll' } },
    { t: 'game', table: 3, round: 2, to: 'all', m: { x: [1, 2] } },
  ];
  test.each(samples)('送って受け取っても変わらない: $t', (msg) => {
    expect(decodeToHub(roundTrip(msg))).toEqual(msg);
  });

  test('トイベースボールの卓を作る要求が通る', () => {
    expect(decodeToHub({ t: 'create', game: 'baseball' })).toEqual({ t: 'create', game: 'baseball' });
  });

  test.each([
    null,
    'start',
    { t: 'hack' },
    { t: 'create', game: 'chess' },
    { t: 'join', table: -1 },
    { t: 'join', table: 1.5 },
    { t: 'game', table: 1, round: 1, to: 6, m: {} },
    { t: 'game', table: 1, round: 1, to: 'some', m: {} },
    { t: 'hello', name: 123 },
    { t: 'hello', name: 'x'.repeat(200) },
  ])('壊れたデータは null: %j', (data) => {
    expect(decodeToHub(data)).toBeNull();
  });
});

describe('親 → 子', () => {
  const state: PlazaState = {
    members: [
      { id: 'h', name: 'ホスト' },
      { id: 'a', name: 'たろう' },
    ],
    tables: [{ id: 1, game: 'six', seats: ['h', 'a'], status: 'playing', round: 1, players: ['h', null] }],
  };
  const samples: FromHub[] = [
    { t: 'welcome', you: 'a' },
    { t: 'rejected', reason: 'full' },
    { t: 'state', state },
    { t: 'game', table: 1, round: 1, from: 0, m: { t: 'start', seed: 5 } },
  ];
  test.each(samples)('送って受け取っても変わらない: $t', (msg) => {
    expect(decodeFromHub(roundTrip(msg))).toEqual(msg);
  });

  test.each([
    { t: 'rejected', reason: 'angry' },
    { t: 'state', state: { members: 'x', tables: [] } },
    { t: 'state', state: { members: [], tables: [{ ...state.tables[0], game: 'chess' }] } },
    { t: 'state', state: { members: [], tables: [{ ...state.tables[0], status: 'sleeping' }] } },
    { t: 'state', state: { members: [{ id: 'a', name: 'x'.repeat(50) }], tables: [] } },
    { t: 'game', table: 1, round: 1, from: -1, m: {} },
  ])('壊れたデータは null: %j', (data) => {
    expect(decodeFromHub(data)).toBeNull();
  });
});
