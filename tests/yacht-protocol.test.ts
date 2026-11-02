import { createRng } from '../src/core/rng';
import { YachtGame } from '../src/yacht/game';
import { decodeToGuest, decodeToHost, normalizeName } from '../src/yacht/protocol';
import { isCategory, isDice } from '../src/yacht/rules';

const TOKEN = '0123456789abcdef0123456789abcdef';
const state = (names = ['A', 'B']) => {
  const g = new YachtGame(names, 0, createRng(1));
  g.roll(0);
  g.toggleHold(0, 1);
  return g.state();
};

describe('decodeToHost', () => {
  test('正しいメッセージは通る', () => {
    expect(decodeToHost({ t: 'hello', token: TOKEN, name: 'たろう' })).toEqual({ t: 'hello', token: TOKEN, name: 'たろう' });
    expect(decodeToHost({ t: 'roll' })).toEqual({ t: 'roll' });
    expect(decodeToHost({ t: 'hold', die: 4 })).toEqual({ t: 'hold', die: 4 });
    expect(decodeToHost({ t: 'score', category: 'yacht' })).toEqual({ t: 'score', category: 'yacht' });
  });

  test('壊れたメッセージは null', () => {
    expect(decodeToHost({ t: 'hold', die: 5 })).toBeNull();
    expect(decodeToHost({ t: 'hold', die: -1 })).toBeNull();
    expect(decodeToHost({ t: 'score', category: 'bonus' })).toBeNull();
    expect(decodeToHost({ t: 'hello', token: 'abc', name: 'x' })).toBeNull();
    expect(decodeToHost({ t: 'hello', token: TOKEN.toUpperCase(), name: 'x' })).toBeNull();
    expect(decodeToHost({ t: 'hello', token: TOKEN, name: 3 })).toBeNull();
    expect(decodeToHost({ t: 'skip' })).toBeNull();
    expect(decodeToHost(null)).toBeNull();
  });

  test('余計な項目は取り除く', () => {
    expect(decodeToHost({ t: 'roll', extra: 1 })).toEqual({ t: 'roll' });
  });
});

describe('decodeToGuest', () => {
  test('正しいメッセージは通る', () => {
    const s = state();
    expect(decodeToGuest({ t: 'welcome', seat: 1 })).toEqual({ t: 'welcome', seat: 1 });
    expect(decodeToGuest({ t: 'lobby', players: [{ name: 'A', online: true }] })).toEqual({
      t: 'lobby',
      players: [{ name: 'A', online: true }],
    });
    const msg = { t: 'state', state: s, online: [true, false], awaySince: [null, 1000] };
    expect(decodeToGuest(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
    expect(decodeToGuest({ t: 'rejected', reason: 'full' })).toEqual({ t: 'rejected', reason: 'full' });
  });

  test('まだ振っていない状態（dice が空）も通る', () => {
    const s = new YachtGame(['A', 'B'], 0, createRng(1)).state();
    expect(decodeToGuest({ t: 'state', state: s, online: [true, true], awaySince: [null, null] })).not.toBeNull();
  });

  test('7人の state は null', () => {
    const s = state(['1', '2', '3', '4', '5', '6', '7']);
    expect(decodeToGuest({ t: 'state', state: s, online: s.players.map(() => true), awaySince: s.players.map(() => null) })).toBeNull();
  });

  test('壊れた state は null', () => {
    const good = () => ({ t: 'state', state: state(), online: [true, true], awaySince: [null, null] });
    const bad = [
      (m: any) => (m.state.dice = [7, 1, 1, 1, 1]),
      (m: any) => (m.state.held = [true]),
      (m: any) => (m.state.players[0].sheet.yacht = -1),
      (m: any) => (m.state.players[0].sheet.nope = 1),
      (m: any) => (m.state.current = 2),
      (m: any) => (m.state.rollsUsed = 4),
      (m: any) => (m.online = [true]),
      (m: any) => (m.awaySince = ['x', null]),
    ];
    for (const breakIt of bad) {
      const m = good();
      breakIt(m);
      expect(decodeToGuest(m)).toBeNull();
    }
  });
});

describe('normalizeName', () => {
  test('前後の空白を取り、空なら null、12文字に切る', () => {
    expect(normalizeName('  たろう ')).toBe('たろう');
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('あ'.repeat(20))).toBe('あ'.repeat(12));
    expect(normalizeName('😀'.repeat(20))).toBe('😀'.repeat(12));
  });

  test('絵文字12文字の名前の lobby も通る', () => {
    const players = [{ name: '😀'.repeat(12), online: true }];
    expect(decodeToGuest({ t: 'lobby', players })).toEqual({ t: 'lobby', players });
  });
});

test('isDice / isCategory', () => {
  expect(isDice([1, 2, 3, 4, 5])).toBe(true);
  expect(isDice([0, 2, 3, 4, 5])).toBe(false);
  expect(isDice([1, 2, 3, 4])).toBe(false);
  expect(isCategory('yacht')).toBe(true);
  expect(isCategory('toString')).toBe(false);
});
