import { crossedPlate, launchPitch, type PitchKind, stepPitch, SWING_TICKS } from '../src/baseball/field';
import { type BbMsg, decodeBb } from '../src/baseball/protocol';
import { BaseballSession, RESULT_PAUSE_TICKS } from '../src/baseball/session';

// 2人分のセッションを偽の通信でつなぐ。送ったメッセージは JSON を通して溜めておき、
// flush したときに順番どおり届く（flush を遅らせれば通信の遅れを作れる）。
function pair() {
  const sent: [BbMsg[], BbMsg[]] = [[], []];
  const queue: { to: 0 | 1; data: string }[] = [];
  const sessions = ([0, 1] as const).map(
    (me) =>
      new BaseballSession(me, (m) => {
        sent[me].push(m);
        queue.push({ to: me === 0 ? 1 : 0, data: JSON.stringify(m) });
      }),
  );
  const deliver = (to: 0 | 1, m: unknown) => {
    const msg = decodeBb(JSON.parse(JSON.stringify(m)));
    if (msg) sessions[to].receive(msg);
  };
  const flush = () => {
    while (queue.length) {
      const { to, data } = queue.shift()!;
      deliver(to, JSON.parse(data));
    }
  };
  // 両方を1ステップ進める。auto なら毎ステップ届ける
  const step = (auto = true) => {
    sessions.forEach((s) => s.step());
    if (auto) flush();
  };
  const runUntil = (pred: () => boolean, max = 5000, auto = true) => {
    for (let i = 0; i < max; i++) {
      if (pred()) return i;
      step(auto);
    }
    throw new Error('時間切れ');
  };
  // 1回表は席0が打ち、席1が投げる
  return { batter: sessions[0], pitcher: sessions[1], sessions, sent, flush, deliver, step, runUntil };
}

type Pair = ReturnType<typeof pair>;

const bothReady = (p: Pair) => () => p.sessions.every((s) => s.view().phase.kind === 'ready');

// 1球投げて、両者が次を待つ状態まで進める
function pitchAndSettle(p: Pair, pitcher = p.pitcher) {
  pitcher.pitch();
  p.flush();
  p.runUntil(bothReady(p));
}

// 曲げずに投げたとき、球が本塁を通過するステップ
function crossTick(kind: PitchKind): number {
  let ball = launchPitch(kind);
  let t = 0;
  while (!crossedPlate(ball)) {
    ball = stepPitch(ball, kind, 0);
    t++;
  }
  return t;
}

// 打者側で球が本塁を通過する直前の x を記録しながら判定まで進める
function batterLastX(p: Pair, auto = true): number {
  let x = NaN;
  p.runUntil(
    () => {
      const ph = p.batter.view().phase;
      if (ph.kind === 'pitching') x = ph.ball.pos.x;
      return ph.kind !== 'pitching';
    },
    5000,
    auto,
  );
  return x;
}

describe('BaseballSession', () => {
  test('見逃しのど真ん中はストライク、両者に同じカウントが入る', () => {
    const p = pair();
    pitchAndSettle(p);
    expect(p.batter.view().state.strikes).toBe(1);
    expect(p.pitcher.view().state.strikes).toBe(1);
    expect(p.pitcher.view().lastResult).toBe('strike');
  });

  test('曲げてゾーンを外せばボール', () => {
    const p = pair();
    p.pitcher.selectKind('curve');
    p.pitcher.pitch();
    p.pitcher.steer(1);
    p.flush();
    p.runUntil(bothReady(p));
    expect(p.batter.view().state.balls).toBe(1);
    expect(p.pitcher.view().state.balls).toBe(1);
    expect(p.batter.view().lastResult).toBe('ball');
  });

  test('芯で打てば打球が転がり、両者が同じ結果になる', () => {
    const p = pair();
    const swingAt = crossTick('straight') - SWING_TICKS / 2;
    p.pitcher.pitch();
    p.flush();
    p.runUntil(() => {
      const ph = p.batter.view().phase;
      return ph.kind === 'pitching' && ph.tick === swingAt;
    });
    p.batter.swing();
    p.runUntil(() => p.batter.view().phase.kind === 'rolling');
    p.runUntil(() => p.pitcher.view().phase.kind === 'rolling');
    p.runUntil(bothReady(p));
    expect(p.pitcher.view().state).toEqual(p.batter.view().state);
    expect(p.pitcher.view().lastResult).toBe(p.batter.view().lastResult);
    expect(['ball', 'strike']).not.toContain(p.batter.view().lastResult);
  });

  test('打者側では投手の曲げが届いた時点から効く', () => {
    const now = pair();
    now.pitcher.pitch();
    now.flush();
    now.pitcher.steer(1);
    now.flush();
    const xNow = batterLastX(now);

    const late = pair();
    late.pitcher.pitch();
    late.flush();
    late.pitcher.steer(1);
    for (let i = 0; i < 20; i++) late.step(false);
    late.flush();
    const xLate = batterLastX(late);

    expect(xLate).toBeGreaterThan(0);
    expect(xLate).toBeLessThan(xNow);
  });

  test('曲げの入力は向きが変わったときだけ送る', () => {
    const p = pair();
    p.pitcher.pitch();
    p.pitcher.steer(1);
    p.pitcher.steer(1);
    p.pitcher.steer(1);
    expect(p.sent[1].filter((m) => m.t === 'steer')).toHaveLength(1);
    p.pitcher.steer(0);
    expect(p.sent[1].filter((m) => m.t === 'steer')).toHaveLength(2);
  });

  test('スイングは1投球に1回', () => {
    const p = pair();
    const swingAt = crossTick('straight') - SWING_TICKS / 2;
    p.pitcher.pitch();
    p.flush();
    p.batter.swing(); // 早すぎて空振り
    p.runUntil(() => {
      const ph = p.batter.view().phase;
      return ph.kind === 'pitching' && ph.tick === swingAt;
    });
    p.batter.swing(); // 芯のタイミングでも2回目は効かない
    p.runUntil(bothReady(p));
    expect(p.batter.view().state.strikes).toBe(1);
    expect(p.batter.view().lastResult).toBe('strike');
    expect(p.sent[0].filter((m) => m.t === 'result')).toHaveLength(1);
  });

  test('古い投球番号のメッセージは無視する', () => {
    const p = pair();
    pitchAndSettle(p);
    const first = p.sent[0].find((m) => m.t === 'result')!;
    p.deliver(1, first);
    expect(p.pitcher.view().state.strikes).toBe(1);

    // 2球目のカーブに、1球目の番号で曲げを送っても効かない（曲げなければストライク）
    p.pitcher.selectKind('curve');
    p.pitcher.pitch();
    p.flush();
    p.deliver(0, { t: 'steer', n: 1, dir: 1 });
    p.runUntil(bothReady(p));
    expect(p.batter.view().state.strikes).toBe(2);
    expect(p.pitcher.view().state.strikes).toBe(2);
  });

  test('結果表示の間は次を投げられない', () => {
    const p = pair();
    p.pitcher.pitch();
    p.flush();
    p.runUntil(() => p.pitcher.view().phase.kind === 'pause');
    const before = p.sent[1].length;
    p.pitcher.pitch();
    expect(p.sent[1]).toHaveLength(before);
    const ticks = p.runUntil(() => p.pitcher.view().phase.kind === 'ready');
    expect(ticks).toBe(RESULT_PAUSE_TICKS);
    p.pitcher.pitch();
    expect(p.sent[1]).toHaveLength(before + 1);
  });

  test('3アウトで攻守が入れ替わる', () => {
    const p = pair();
    expect(p.sessions[0].view().role).toBe('batter');
    expect(p.sessions[1].view().role).toBe('pitcher');
    for (let i = 0; i < 9; i++) pitchAndSettle(p);
    expect(p.sessions[0].view().role).toBe('pitcher');
    expect(p.sessions[1].view().role).toBe('batter');
    expect(p.sessions[0].view().state).toEqual(p.sessions[1].view().state);
    expect(p.sessions[0].view().state.half).toBe('bottom');
    // 入れ替わった後も投球が届く
    pitchAndSettle(p, p.sessions[0]);
    expect(p.sessions[1].view().state.strikes).toBe(1);
    expect(p.sessions[0].view().state.strikes).toBe(1);
  });

  test('相手が抜けたら自分の勝ち。決着後は変わらない', () => {
    const p = pair();
    p.batter.opponentLeft();
    const v = p.batter.view();
    expect(v.state.outcome).toEqual({ winner: 0, reason: 'disconnect' });
    expect(v.role).toBe('none');
    p.batter.opponentStalled();
    p.deliver(0, { t: 'pitch', n: 1, kind: 'straight' });
    p.deliver(0, { t: 'result', n: 1, result: 'homer', launch: null });
    expect(p.batter.view().state).toEqual(v.state);
    expect(p.batter.view().phase.kind).toBe('ready');
  });

  test('待っている間だけ waitingForOpponent', () => {
    const p = pair();
    expect(p.batter.view().waitingForOpponent).toBe(true);
    expect(p.pitcher.view().waitingForOpponent).toBe(false);
    p.pitcher.pitch();
    expect(p.pitcher.view().waitingForOpponent).toBe(false);
    // 結果が届かないまま、手元の球が本塁を通過する
    p.runUntil(() => p.pitcher.view().waitingForOpponent, 5000, false);
    expect(p.pitcher.view().phase.kind).not.toBe('pitching');
    p.flush();
    expect(p.batter.view().waitingForOpponent).toBe(false);
    p.runUntil(bothReady(p));
    expect(p.pitcher.view().waitingForOpponent).toBe(false);
    expect(p.batter.view().waitingForOpponent).toBe(true);
  });
});
