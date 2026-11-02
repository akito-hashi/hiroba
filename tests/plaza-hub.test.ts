import { PlazaClient } from '../src/plaza/client';
import { HOST_ID, Hub } from '../src/plaza/hub';
import { type FromHub, decodeFromHub } from '../src/plaza/protocol';

// 親1人（ホスト）と子2人（a, b）を、偽の接続でつなぐ
function setup() {
  const inbox: Record<string, FromHub[]> = { host: [], a: [], b: [] };
  const clients: Record<string, PlazaClient> = {};
  // 実際の通信と同じく JSON を通して形を確かめる
  const deliver = (to: string, m: FromHub) => {
    const msg = decodeFromHub(JSON.parse(JSON.stringify(m)))!;
    inbox[to].push(msg);
    clients[to]?.receive(msg);
  };
  const hub = new Hub('ホスト', (m) => deliver('host', m));
  clients.host = new PlazaClient((m) => hub.hostRequest(m));
  hub.start();
  for (const id of ['a', 'b']) {
    hub.addConnection(id, (m) => deliver(id, m));
    clients[id] = new PlazaClient((m) => hub.receive(id, JSON.parse(JSON.stringify(m))));
    clients[id].hello(id === 'a' ? 'あきこ' : 'ぶんた');
  }
  return { hub, clients, inbox };
}

describe('Hub と PlazaClient', () => {
  test('参加すると全員に同じ広場の状態が配られる', () => {
    const { clients } = setup();
    for (const c of Object.values(clients)) {
      expect(c.state?.members.map((m) => m.name)).toEqual(['ホスト', 'あきこ', 'ぶんた']);
    }
    expect(clients.a.me).toBe('a');
    expect(clients.host.me).toBe(HOST_ID);
  });

  test('hello の前の要求は無視する', () => {
    const { hub, inbox } = setup();
    hub.addConnection('c', () => {});
    hub.receive('c', { t: 'create', game: 'six' });
    expect(inbox.a.at(-1)?.t === 'state' && (inbox.a.at(-1) as { state: { tables: unknown[] } }).state.tables).toEqual([]);
  });

  test('卓の中のゲームのメッセージは宛先の席だけに届く', () => {
    const { clients } = setup();
    clients.a.request({ t: 'create', game: 'yacht' });
    const table = clients.a.myTable()!.id;
    clients.b.request({ t: 'join', table });
    clients.host.request({ t: 'join', table });
    clients.a.request({ t: 'start' });

    const got: Record<string, [number, unknown][]> = { host: [], a: [], b: [] };
    for (const id of ['host', 'a', 'b']) {
      clients[id].link(table, 1).onMessage((from, m) => got[id].push([from, m]));
    }
    // 席: a=0, b=1, host=2
    clients.a.link(table, 1).send(2, 'to-host');
    clients.host.link(table, 1).broadcast('hello-all');
    expect(got.host).toEqual([[0, 'to-host']]);
    expect(got.a).toEqual([[2, 'hello-all']]);
    expect(got.b).toEqual([[2, 'hello-all']]);
  });

  test('卓の外の人や、古い開始回数のメッセージは届かない', () => {
    const { clients, hub } = setup();
    clients.a.request({ t: 'create', game: 'six' });
    const table = clients.a.myTable()!.id;
    clients.b.request({ t: 'join', table });
    clients.a.request({ t: 'start' });
    const got: unknown[] = [];
    clients.b.link(table, 1).onMessage((_, m) => got.push(m));
    // 卓の外のホストが送ろうとしても届かない
    clients.host.link(table, 1).send(1, 'intruder');
    // 古い開始回数
    hub.receive('a', { t: 'game', table, round: 0, to: 1, m: 'stale' });
    clients.a.link(table, 1).send(1, 'ok');
    expect(got).toEqual(['ok']);
  });

  test('遊んでいる最中に切断すると、残りの人に「その席が抜けた」が伝わる', () => {
    const { clients, hub } = setup();
    clients.a.request({ t: 'create', game: 'six' });
    const table = clients.a.myTable()!.id;
    clients.b.request({ t: 'join', table });
    clients.a.request({ t: 'start' });
    const left: [number, number, number][] = [];
    clients.a.onPlayerLeft = (t, r, seat) => left.push([t, r, seat]);
    hub.removeConnection('b');
    expect(left).toEqual([[table, 1, 1]]);
    expect(clients.a.state?.members.map((m) => m.id)).toEqual([HOST_ID, 'a']);
  });

  test('ゲームから戻った人も「抜けた」として伝わる', () => {
    const { clients } = setup();
    clients.a.request({ t: 'create', game: 'six' });
    const table = clients.a.myTable()!.id;
    clients.b.request({ t: 'join', table });
    clients.a.request({ t: 'start' });
    const left: number[] = [];
    clients.b.onPlayerLeft = (_t, _r, seat) => left.push(seat);
    clients.a.request({ t: 'leftGame', table, round: 1 });
    expect(left).toEqual([0]);
  });

  test('親が卓の主ですぐ送っても、子には状態がゲームのメッセージより先に届く', () => {
    const { clients, inbox } = setup();
    clients.host.request({ t: 'create', game: 'six' });
    const table = clients.host.myTable()!.id;
    clients.a.request({ t: 'join', table });
    // 親の画面は、状態を受け取った瞬間にゲームを開いて最初のメッセージを送る
    let sent = false;
    clients.host.onChange = () => {
      const t = clients.host.myTable();
      if (!sent && t?.status === 'playing') {
        sent = true;
        clients.host.link(t.id, t.round).send(1, 'start');
      }
    };
    inbox.a.length = 0;
    clients.host.request({ t: 'start' });
    expect(inbox.a.map((m) => m.t)).toEqual(['state', 'game']);
  });

  test('満員なら断られる', () => {
    const { hub } = setup();
    const got: FromHub[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `x${i}`;
      hub.addConnection(id, (m) => got.push(m));
      hub.receive(id, { t: 'hello', name: id });
    }
    expect(got.filter((m) => m.t === 'rejected')).toEqual([{ t: 'rejected', reason: 'full' }]);
  });
});
