import { LudoOnline } from '../src/games/ludo-online';
import { decodeLudoState } from '../src/ludo/protocol';
import type { LudoState } from '../src/ludo/rules';
import type { TableLink } from '../src/plaza/client';

// 卓の中継を真似た偽の送受信口。JSON を通して同期的に届ける
function network(n: number) {
  const handlers: ((from: number, m: unknown) => void)[][] = Array.from({ length: n }, () => []);
  const gone = new Set<number>();
  const deliver = (from: number, to: number, m: unknown) => {
    if (gone.has(from) || gone.has(to)) return;
    handlers[to].forEach((h) => h(from, JSON.parse(JSON.stringify(m))));
  };
  const link = (seat: number): TableLink => ({
    send: (to, m) => deliver(seat, to, m),
    broadcast: (m) => handlers.forEach((_, to) => to !== seat && deliver(seat, to, m)),
    onMessage: (h) => {
      handlers[seat].push(h);
      return () => {};
    },
  });
  return { link, gone };
}

function setup(n: number) {
  const names = ['ホスト', 'あきこ', 'ぶんた', 'ちえ'].slice(0, n);
  const net = network(n);
  const views: (LudoState | null)[] = names.map(() => null);
  // 6 → 3 → … と決まった目を出す
  const faces = [6, 3, 2, 5];
  let i = 0;
  const rng = () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
  const games = names.map((_, seat) => new LudoOnline(seat, names, net.link(seat), (s) => (views[seat] = s), rng));
  return { games, views, net };
}

describe('LudoOnline', () => {
  test('全員に同じ状態が届き、色は卓の席順', () => {
    const { views } = setup(3);
    for (const v of views) {
      expect(v?.players.map((p) => p.name)).toEqual(['ホスト', 'あきこ', 'ぶんた']);
      expect(v?.players.map((p) => p.color)).toEqual([0, 1, 2]);
    }
  });

  test('手番の人の操作が全員に反映され、手番でない人の操作は無視される', () => {
    const { games, views } = setup(2);
    games[1].roll(); // 手番ではない
    expect(views[0]?.dice).toBeNull();
    games[0].roll(); // 6（最初から出ているコマ0を6マス進める）
    games[0].move(0);
    for (const v of views) expect(v?.players[0].pieces[0]).toBe(6);
  });

  test('参加した側から振っても進む', () => {
    const { games, views } = setup(2);
    games[0].roll(); // 6
    games[0].move(0);
    games[0].roll(); // 3
    games[0].move(0); // 次の人へ
    expect(views[1]?.current).toBe(1);
    games[1].roll();
    expect(views[0]?.dice).not.toBeNull();
    expect(views[0]?.current === 1 || views[0]?.current === 0).toBe(true);
  });

  test('途中で抜けた人のコマは消え、手番は飛ばされる', () => {
    const { games, views, net } = setup(3);
    net.gone.add(1);
    games[0].playerLeft(1);
    expect(views[0]?.players[1].removed).toBe(true);
    expect(views[2]?.players[1].removed).toBe(true);
  });

  test('進行役が抜けたら、ほかの人に伝わる。決着後なら伝えない', () => {
    const { games } = setup(2);
    let left = 0;
    games[1].onHostLeft = () => left++;
    games[1].playerLeft(0);
    expect(left).toBe(1);

    const b = setup(2);
    let left2 = 0;
    b.games[1].onHostLeft = () => left2++;
    b.games[0].playerLeft(1); // 1人になって決着
    b.games[1].playerLeft(0);
    expect(left2).toBe(0);
  });
});

describe('decodeLudoState', () => {
  const ok: LudoState = {
    players: [
      { name: 'a', color: 0, pieces: [-1, 0, 41, 43], removed: false },
      { name: 'b', color: 2, pieces: [-1, -1, -1, -1], removed: true },
    ],
    current: 0,
    dice: 6,
    phase: 'move',
    winner: null,
    ended: false,
    bonus: false,
    rolls: 3,
  };

  test('正しい状態は通す', () => {
    expect(decodeLudoState(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
  });

  test.each([
    ['範囲外のコマ', { ...ok, players: [{ ...ok.players[0], pieces: [44, 0, 0, 0] }, ok.players[1]] }],
    ['コマの数が違う', { ...ok, players: [{ ...ok.players[0], pieces: [0] }, ok.players[1]] }],
    ['範囲外の手番', { ...ok, current: 2 }],
    ['範囲外の目', { ...ok, dice: 7 }],
    ['知らない段階', { ...ok, phase: 'dance' }],
    ['1人だけ', { ...ok, players: [ok.players[0]] }],
    ['bonus がない', { ...ok, bonus: undefined }],
    ['rolls が負', { ...ok, rolls: -1 }],
  ])('壊れた状態は null: %s', (_, data) => {
    expect(decodeLudoState(data)).toBeNull();
  });
});
