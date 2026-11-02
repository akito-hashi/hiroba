import { YachtOnline } from '../src/games/yacht-online';
import type { TableLink } from '../src/plaza/client';
import type { YachtState } from '../src/yacht/game';

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
  const views: { state: YachtState | null; mySeat: number }[] = names.map(() => ({ state: null, mySeat: -1 }));
  const games = names.map((_, seat) => new YachtOnline(seat, names, net.link(seat), (state, mySeat) => (views[seat] = { state, mySeat })));
  return { games, views, net };
}

describe('YachtOnline', () => {
  test('全員がそろうと始まり、全員に同じ状態が届く', () => {
    const { views } = setup(3);
    for (const v of views) {
      expect(v.state?.players.map((p) => p.name)).toEqual(['ホスト', 'あきこ', 'ぶんた']);
    }
    expect(views.map((v) => v.mySeat)).toEqual([0, 1, 2]);
  });

  test('手番の人の操作が全員に反映される', () => {
    const { games, views } = setup(3);
    const first = views[0].state!.current;
    games[first].roll();
    for (const v of views) expect(v.state!.rollsUsed).toBe(1);
    // 手番でない人の操作は無視される
    const other = (first + 1) % 3;
    games[other].roll();
    expect(views[0].state!.rollsUsed).toBe(1);
  });

  test('途中で1人抜けたら、その人を外して続ける', () => {
    const { games, views, net } = setup(3);
    net.gone.add(2);
    games[0].playerLeft(2);
    expect(views[0].state!.players[2].removed).toBe(true);
    expect(views[1].state!.players[2].removed).toBe(true);
    games[1].dispose();
  });

  test('進行役（席0）が抜けたら、ほかの人には終わったことが伝わる', () => {
    const { games } = setup(2);
    let ended = false;
    games[1].onHostLeft = () => (ended = true);
    games[1].playerLeft(0);
    expect(ended).toBe(true);
  });

  test('開始前に誰かが抜けたら、進行役以外の人も始まらないと分かる', () => {
    const names = ['ホスト', 'あきこ', 'ぶんた'];
    const net = network(3);
    net.gone.add(2);
    // 席0はまだ受け取っていない状態を真似るため、席1だけ作る
    const guest = new YachtOnline(1, names, net.link(1), () => {});
    guest.playerLeft(2);
    expect(guest.cancelled).toBe(true);
  });

  test('決着した後に進行役が抜けても、結果はそのまま見られる', () => {
    const { games, views } = setup(2);
    let hostLeft = false;
    games[1].onHostLeft = () => (hostLeft = true);
    // 最後まで進める
    for (let i = 0; i < 100 && !views[0].state!.ended; i++) {
      const s = views[0].state!;
      const g = games[s.current];
      if (s.rollsUsed === 0) g.roll();
      else {
        const sheet = s.players[s.current].sheet;
        const free = (['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourDice', 'fullHouse', 'sStraight', 'bStraight', 'yacht'] as const).find((c) => sheet[c] === undefined)!;
        g.score(free);
      }
    }
    expect(views[1].state!.ended).toBe(true);
    games[1].playerLeft(0);
    expect(hostLeft).toBe(false);
  });

  test('開始前に誰かが抜けたら始まらない', () => {
    const names = ['ホスト', 'あきこ', 'ぶんた'];
    const net = network(3);
    let hostState: YachtState | null = null;
    // 席2はつながらないまま
    net.gone.add(2);
    const host = new YachtOnline(0, names, net.link(0), (s) => (hostState = s));
    new YachtOnline(1, names, net.link(1), () => {});
    host.playerLeft(2);
    expect(hostState).toBeNull();
    expect(host.cancelled).toBe(true);
  });
});
