import { Pacer, stateKey } from '../src/ludo/pacer';
import { LudoGame } from '../src/ludo/rules';

describe('Pacer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('予約し直すと、前の予約は取り消される', () => {
    const p = new Pacer();
    const ran: string[] = [];
    p.schedule(100, 'k', () => 'k', () => ran.push('old'));
    p.schedule(100, 'k', () => 'k', () => ran.push('new'));
    vi.advanceTimersByTime(200);
    expect(ran).toEqual(['new']);
  });

  test('実行するときに状態が変わっていたら何もしない', () => {
    const p = new Pacer();
    let key = 'a';
    const ran: string[] = [];
    p.schedule(100, 'a', () => key, () => ran.push('a'));
    key = 'b';
    vi.advanceTimersByTime(200);
    expect(ran).toEqual([]);
  });

  test('取り消したら動かない', () => {
    const p = new Pacer();
    const ran: string[] = [];
    p.schedule(100, 'k', () => 'k', () => ran.push('x'));
    p.cancel();
    vi.advanceTimersByTime(200);
    expect(ran).toEqual([]);
  });
});

describe('stateKey', () => {
  test('手番・目・段階・コマの位置が同じなら同じ、どれかが違えば違う', () => {
    const g = new LudoGame(['a', 'b'], 0, () => 0.99);
    const before = stateKey(g.state());
    expect(stateKey(g.state())).toBe(before);
    g.roll(0);
    expect(stateKey(g.state())).not.toBe(before);
  });
});
