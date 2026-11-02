import { createRng } from '../src/core/rng';
import { AWAY_GRACE_MS, YachtHost } from '../src/yacht/host';
import { type ToGuest, decodeToGuest } from '../src/yacht/protocol';

const tok = (n: number) => n.toString(16).padStart(32, '0');

function setup() {
  const sent: { to: string; m: ToGuest }[] = [];
  let time = 1_000_000;
  const host = new YachtHost('親', tok(0), (to, m) => sent.push({ to, m }), createRng(1), () => time);
  const last = (to: string) => sent.filter((s) => s.to === to).at(-1)?.m;
  return { host, sent, last, advance: (ms: number) => (time += ms) };
}

function started(n = 3) {
  const t = setup();
  for (let i = 1; i < n; i++) t.host.hello(`c${i}`, tok(i), `子${i}`);
  expect(t.host.start()).toBe(true);
  return t;
}

describe('YachtHost', () => {
  test('参加すると席が割り当てられ、全員に lobby が届く', () => {
    const { host, last } = setup();
    host.hello('c1', tok(1), 'たろう');
    host.hello('c2', tok(2), 'はなこ');
    expect(host.view().players).toEqual([
      { name: '親', online: true },
      { name: 'たろう', online: true },
      { name: 'はなこ', online: true },
    ]);
    expect(last('c1')).toEqual({ t: 'lobby', players: host.view().players });
    expect(last('c2')).toEqual({ t: 'lobby', players: host.view().players });
  });

  test('参加した子に席番号を知らせる', () => {
    const { host, sent } = setup();
    host.hello('c1', tok(1), 'たろう');
    expect(sent).toContainEqual({ to: 'c1', m: { t: 'welcome', seat: 1 } });
  });

  test('空・空白の名前は参加できず、重複には (2) が付く', () => {
    const { host } = setup();
    host.hello('c1', tok(1), '   ');
    expect(host.view().players).toHaveLength(1);
    host.hello('c2', tok(2), '親');
    host.hello('c3', tok(3), '親');
    expect(host.view().players.map((p) => p.name)).toEqual(['親', '親(2)', '親(3)']);
  });

  test('1人では開始できない', () => {
    expect(setup().host.start()).toBe(false);
  });

  test('開始後の新規参加は rejected started、7人目は rejected full', () => {
    const t = started(2);
    t.host.hello('c9', tok(9), 'おそい');
    expect(t.last('c9')).toEqual({ t: 'rejected', reason: 'started' });

    const u = setup();
    for (let i = 1; i <= 5; i++) u.host.hello(`c${i}`, tok(i), `子${i}`);
    u.host.hello('c6', tok(6), '七人目');
    expect(u.last('c6')).toEqual({ t: 'rejected', reason: 'full' });
    expect(u.host.view().players).toHaveLength(6);
  });

  test('開始すると全員に state が届き、親から始まる', () => {
    const { host, last } = started();
    const m = last('c1');
    expect(m?.t).toBe('state');
    expect(host.view().game?.current).toBe(0);
  });

  test('手番でない子の操作は状態を変えない', () => {
    const { host } = started();
    const before = host.view().game;
    host.receive('c1', { t: 'roll' });
    host.receive('c2', { t: 'score', category: 'choice' });
    expect(host.view().game).toEqual(before);
  });

  test('手番の子の操作は反映される', () => {
    const { host } = started();
    host.hostAction({ t: 'roll' });
    host.hostAction({ t: 'score', category: 'choice' });
    host.receive('c1', { t: 'roll' });
    host.receive('c1', { t: 'hold', die: 2 });
    expect(host.view().game?.held[2]).toBe(true);
    host.receive('c1', { t: 'score', category: 'choice' });
    expect(host.view().game?.players[1].sheet.choice).toBeGreaterThan(0);
  });

  test('同じ token で入り直すと同じ席に戻り、古い接続の操作は無視される', () => {
    const { host, sent } = started();
    host.hostAction({ t: 'roll' });
    host.hostAction({ t: 'score', category: 'choice' });
    host.hello('c1b', tok(1), '別名');
    expect(sent).toContainEqual({ to: 'c1b', m: { t: 'welcome', seat: 1 } });
    expect(host.view().players).toHaveLength(3);
    expect(host.view().players[1].name).toBe('子1');
    host.receive('c1', { t: 'roll' });
    expect(host.view().game?.rollsUsed).toBe(0);
    host.receive('c1b', { t: 'roll' });
    expect(host.view().game?.rollsUsed).toBe(1);
    // 古い接続が後から閉じても、新しい接続はオンラインのまま
    host.leave('c1');
    expect(host.view().players[1].online).toBe(true);
  });

  test('抜けて30秒未満はスキップできず、30秒たつとできる', () => {
    const t = started();
    t.host.hostAction({ t: 'roll' });
    t.host.hostAction({ t: 'score', category: 'choice' });
    t.host.leave('c1');
    expect(t.host.view().players[1].online).toBe(false);
    expect(t.host.view().awaySince[1]).not.toBeNull();
    expect(t.host.canSkip()).toBe(false);
    expect(t.host.skip()).toBe(false);
    t.advance(AWAY_GRACE_MS);
    expect(t.host.canSkip()).toBe(true);
    expect(t.host.skip()).toBe(true);
    expect(t.host.view().game?.players[1].sheet.ones).toBe(0);
    expect(t.host.view().game?.current).toBe(2);
  });

  test('オンラインの人の番はスキップできない', () => {
    const t = started();
    t.advance(AWAY_GRACE_MS * 2);
    expect(t.host.canSkip()).toBe(false);
  });

  test('親は外せず、子は外せる', () => {
    const { host } = started();
    expect(host.remove(0)).toBe(false);
    expect(host.remove(2)).toBe(true);
    expect(host.view().game?.players[2].removed).toBe(true);
  });

  function finish(host: YachtHost) {
    for (let i = 0; i < 100 && !host.view().game?.ended; i++) {
      const g = host.view().game!;
      const empty = (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourDice', 'fullHouse', 'sStraight', 'bStraight', 'yacht'] as const).find(
        (c) => g.players[g.current].sheet[c] === undefined,
      )!;
      const act = (m: Parameters<YachtHost['hostAction']>[0]) =>
        g.current === 0 ? host.hostAction(m) : host.receive(`c${g.current}`, m);
      act({ t: 'roll' });
      act({ t: 'score', category: empty });
    }
    expect(host.view().phase).toBe('ended');
  }

  test('再戦は終了後だけ。外された人は除き、オフラインの人は残し、先手が1つずれる', () => {
    const t = started(4);
    expect(t.host.rematch()).toBe(false);
    t.host.remove(2);
    finish(t.host);
    t.host.leave('c3');
    expect(t.host.rematch()).toBe(true);
    const v = t.host.view();
    expect(v.phase).toBe('playing');
    expect(v.players.map((p) => p.name)).toEqual(['親', '子1', '子3']);
    expect(v.players[2].online).toBe(false);
    expect(v.game?.firstPlayer).toBe(1);
    expect(v.game?.current).toBe(1);
    // 席が詰まったことを子に知らせ、詰めた先の席で操作できる
    expect(t.sent).toContainEqual({ to: 'c1', m: { t: 'welcome', seat: 1 } });
    t.host.receive('c1', { t: 'roll' });
    expect(t.host.view().game?.rollsUsed).toBe(1);
  });

  test('snapshot から restore すると同じ盤面で、子は全員オフライン扱い', () => {
    const t = started();
    t.host.hostAction({ t: 'roll' });
    const snap = JSON.parse(JSON.stringify(t.host.snapshot()));
    const sent: { to: string; m: ToGuest }[] = [];
    const restored = YachtHost.restore(snap, (to, m) => sent.push({ to, m }), createRng(2), () => 5);
    expect(restored.view().game).toEqual(t.host.view().game);
    expect(restored.view().players.map((p) => p.online)).toEqual([true, false, false]);
    restored.hello('c1x', tok(1), '子1');
    expect(sent).toContainEqual({ to: 'c1x', m: { t: 'welcome', seat: 1 } });
    expect(restored.view().players[1].online).toBe(true);
  });

  test('12文字の重複名や絵文字の名前でも、子が受け取れる状態を送る', () => {
    const { host, last } = setup();
    host.hello('c1', tok(1), 'abcdefghijkl');
    host.hello('c2', tok(2), 'abcdefghijkl');
    host.hello('c3', tok(3), '😀'.repeat(12));
    expect(host.view().players[2].name).toBe('abcdefghi(2)');
    for (const c of ['c1', 'c2', 'c3']) expect(decodeToGuest(JSON.parse(JSON.stringify(last(c))))).not.toBeNull();
    host.start();
    for (const c of ['c1', 'c2', 'c3']) expect(decodeToGuest(JSON.parse(JSON.stringify(last(c))))).not.toBeNull();
  });

  test('親の名前も整える', () => {
    const h = new YachtHost('  ' + 'あ'.repeat(20), tok(0), () => {}, createRng(1));
    expect(h.view().players[0].name).toBe('あ'.repeat(12));
  });

  test('1つの接続は1つの席しか取れない', () => {
    const { host } = setup();
    host.hello('x', tok(1), 'A');
    host.hello('x', tok(2), 'B');
    host.hello('x', tok(3), 'C');
    expect(host.view().players).toHaveLength(2);
  });

  test('形の確かめられていないデータは無視する', () => {
    const { host } = started();
    host.hostAction({ t: 'roll' });
    const before = host.view().game;
    host.receive('c1', { t: 'score', category: 'x' });
    host.receive('c1', null);
    host.receive('c1', 'roll');
    expect(host.view().game).toEqual(before);
  });

  test('状態が変わるたびに onChange が呼ばれる', () => {
    const { host } = setup();
    let calls = 0;
    host.onChange = () => calls++;
    host.hello('c1', tok(1), 'たろう');
    host.start();
    expect(calls).toBe(2);
  });
});
