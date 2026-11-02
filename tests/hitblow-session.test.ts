import { commit, randomSalt } from '../src/hitblow/commit';
import type { HbMsg } from '../src/hitblow/protocol';
import { HbSession } from '../src/hitblow/session';

// 2人分のセッションを直接つなぐ。sent に送ったメッセージを残す。
// 本物の通信と同じく、届くのは後（flush したとき）で、順番は保たれる。
function pair() {
  const sent: [HbMsg[], HbMsg[]] = [[], []];
  const sessions: HbSession[] = [];
  const queue: (() => Promise<void>)[] = [];
  for (const me of [0, 1] as const) {
    sessions.push(
      new HbSession(me, (m) => {
        sent[me].push(m);
        const copy = JSON.parse(JSON.stringify(m));
        queue.push(() => sessions[1 - me].receive(copy));
      }),
    );
  }
  const flush = async () => {
    while (queue.length) await queue.shift()!();
  };
  return { a: sessions[0], b: sessions[1], sent, flush };
}

const A_SECRET = [0, 0, 1, 2];
const B_SECRET = [5, 4, 3, 3];

async function ready() {
  const p = pair();
  await p.a.setSecret(A_SECRET);
  await p.b.setSecret(B_SECRET);
  await p.flush();
  return p;
}

describe('HbSession', () => {
  test('両者が正解を決めるまで対戦は始まらない', async () => {
    const p = pair();
    expect(p.a.view().phase).toBe('setup');
    await p.a.setSecret(A_SECRET);
    await p.flush();
    expect(p.a.view().phase).toBe('waiting');
    expect(p.a.guess([0, 0, 0, 0])).toBe(false);
    await p.b.setSecret(B_SECRET);
    await p.flush();
    expect(p.a.view().phase).toBe('playing');
    expect(p.b.view().phase).toBe('playing');
  });

  test('不正な正解は設定できない', async () => {
    const p = pair();
    expect(await p.a.setSecret([0, 1, 2])).toBe(false);
    expect(p.a.view().phase).toBe('setup');
  });

  test('推測すると相手のブラウザで判定され、自分の履歴に残る', async () => {
    const p = await ready();
    expect(p.a.view().myTurn).toBe(true);
    expect(p.a.guess([5, 3, 3, 0])).toBe(true);
    expect(p.a.view().waitingResult).toBe(true);
    expect(p.a.guess([5, 3, 3, 0])).toBe(false);
    await p.flush();
    expect(p.a.view().myHistory).toEqual([{ guess: [5, 3, 3, 0], result: { hit: 2, blow: 1 } }]);
    expect(p.a.view().myTurn).toBe(false);
    expect(p.b.view().oppTurns).toBe(1);
    expect(p.b.view().myTurn).toBe(true);
  });

  test('正解は相手に送らず、封印値だけを送る（決着まで）', async () => {
    const p = await ready();
    p.a.guess([1, 1, 1, 1]);
    await p.flush();
    p.b.guess([1, 1, 1, 1]);
    await p.flush();
    for (const m of [...p.sent[0], ...p.sent[1]]) expect(m.t).not.toBe('reveal');
    expect(JSON.stringify(p.sent[0])).not.toContain(JSON.stringify(A_SECRET));
    expect(p.b.view().oppSecret).toBeNull();
  });

  test('自分の番でないときに来た推測は無視する', async () => {
    const p = await ready();
    await p.a.receive({ t: 'guess', code: [0, 0, 0, 0] });
    expect(p.a.view().myTurn).toBe(true);
    expect(p.a.view().oppTurns).toBe(0);
  });

  test('頼んでいない判定は無視する', async () => {
    const p = await ready();
    await p.a.receive({ t: 'result', hit: 4, blow: 0 });
    expect(p.a.view().myHistory).toEqual([]);
  });

  test('当てたら正解を公開し合い、照合して決着', async () => {
    const p = await ready();
    p.a.guess(B_SECRET);
    await p.flush();
    expect(p.a.view().outcome).toBeNull();
    p.b.guess([0, 0, 0, 0]);
    await p.flush();
    for (const s of [p.a, p.b]) {
      expect(s.view().phase).toBe('ended');
      expect(s.view().outcome).toEqual({ winner: 0, reason: 'solved' });
    }
    expect(p.a.view().oppSecret).toEqual(B_SECRET);
    expect(p.b.view().oppSecret).toEqual(A_SECRET);
  });

  test('嘘の判定を返していたら、公開後に不正として負けになる', async () => {
    // 相手（後攻）は手でメッセージを送る
    const sent: HbMsg[] = [];
    const a = new HbSession(0, (m) => sent.push(m));
    await a.setSecret(A_SECRET);
    const salt = randomSalt();
    await a.receive({ t: 'ready', commitment: await commit(B_SECRET, salt) });
    a.guess(B_SECRET);
    // 本当は 4 ヒットなのに外れと嘘をつく
    await a.receive({ t: 'result', hit: 0, blow: 0 });
    await a.receive({ t: 'guess', code: A_SECRET });
    expect(a.view().phase).toBe('revealing');
    expect(sent.at(-1)).toEqual(expect.objectContaining({ t: 'reveal' }));
    await a.receive({ t: 'reveal', secret: B_SECRET, salt });
    expect(a.view().phase).toBe('ended');
    expect(a.view().outcome).toEqual({ winner: 0, reason: 'cheat' });
  });

  // 後攻が嘘の判定で決着させたところまで進める（a は正解の公開待ち）
  async function liedAndSolved() {
    const sent: HbMsg[] = [];
    const a = new HbSession(0, (m) => sent.push(m));
    await a.setSecret(A_SECRET);
    const salt = randomSalt();
    await a.receive({ t: 'ready', commitment: await commit(B_SECRET, salt) });
    a.guess(B_SECRET);
    await a.receive({ t: 'result', hit: 0, blow: 0 });
    await a.receive({ t: 'guess', code: A_SECRET });
    expect(a.view().phase).toBe('revealing');
    return { a, salt };
  }

  test('正解を公開せずに切断したら、公開しなかった側の負け', async () => {
    const { a } = await liedAndSolved();
    a.disconnected();
    expect(a.view().phase).toBe('ended');
    expect(a.view().outcome).toEqual({ winner: 0, reason: 'cheat' });
  });

  test('公開された正解を照合している間に切断されても、不正の判定は残る', async () => {
    const { a, salt } = await liedAndSolved();
    const verifying = a.receive({ t: 'reveal', secret: B_SECRET, salt });
    a.disconnected();
    await verifying;
    expect(a.view().phase).toBe('ended');
    expect(a.view().outcome).toEqual({ winner: 0, reason: 'cheat' });
  });

  test('正解の公開を待ち続けて時間切れなら、公開しなかった側の負け', async () => {
    const { a } = await liedAndSolved();
    a.opponentStalled();
    expect(a.view().outcome).toEqual({ winner: 0, reason: 'cheat' });
    expect(a.view().phase).toBe('ended');
  });

  test('判定を待ち続けて時間切れなら、待たせた側の負け', async () => {
    const p = await ready();
    p.a.guess([0, 0, 0, 0]);
    p.a.opponentStalled();
    expect(p.a.view().phase).toBe('ended');
    expect(p.a.view().outcome).toEqual({ winner: 0, reason: 'stalled' });
  });

  test('自分が待たせている側のときは時間切れにならない', async () => {
    const p = await ready();
    p.a.opponentStalled();
    expect(p.a.view().phase).toBe('playing');
  });

  test('暗号機能が使えない環境では正解を設定できず、待ち状態にもならない', async () => {
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('insecure'));
    const p = pair();
    expect(await p.a.setSecret(A_SECRET)).toBe(false);
    expect(p.a.view().phase).toBe('setup');
    expect(p.sent[0]).toEqual([]);
    spy.mockRestore();
  });

  test('相手の ready が先に来ても、自分の ready を送るまでは推測できない', async () => {
    const p = pair();
    await p.b.setSecret(B_SECRET);
    await p.flush();
    const setting = p.a.setSecret(A_SECRET);
    expect(p.a.view().myTurn).toBe(false);
    await setting;
    expect(p.sent[0][0].t).toBe('ready');
    expect(p.a.view().myTurn).toBe(true);
  });

  test('対戦中に切断したら残った側の勝ち', async () => {
    const p = await ready();
    p.a.disconnected();
    expect(p.a.view().phase).toBe('ended');
    expect(p.a.view().outcome).toEqual({ winner: 0, reason: 'disconnect' });
  });

  test('変化があるたびに onChange が呼ばれる', async () => {
    const p = pair();
    let n = 0;
    p.a.onChange = () => n++;
    await p.a.setSecret(A_SECRET);
    expect(n).toBeGreaterThan(0);
  });
});
