// トイベースボールの CPU。人と同じ BaseballSession を操作するだけなので、判定はネット対戦と同じになる。
// 盤の動きは純粋関数なので、球がこの先どこを通るかを先読みして投げる・振る。
import { type Ball, crossedPlate, PITCH_KINDS, PLATE_HALF, type PitchKind, type Steer, stepPitch, SWING_TICKS } from './field';
import type { BbMsg } from './protocol';
import { BaseballSession } from './session';

export type BbCpuLevel = 'weak' | 'normal' | 'strong';

type Style = {
  think: [number, number]; // 投げるまでに考えるステップ数（最小, 最大）
  timingError: number; // スイングの芯からのずれ（±ステップ）。8 を超えると空振りになる
  chase: number; // ゾーンからこれだけ外れた球まで手を出す
};
const STYLES: Record<BbCpuLevel, Style> = {
  weak: { think: [90, 150], timingError: 12, chase: 2.5 },
  normal: { think: [60, 120], timingError: 10, chase: 1 },
  strong: { think: [45, 90], timingError: 4, chase: 0 },
};
// 投手が狙う位置からこれだけずれていれば曲げる
const STEER_DEADBAND = 0.3;

// 曲げがこの先変わらないとして、球が本塁を通るまでのステップ数と x を求める
function predictCross(ball: Ball, kind: PitchKind, steer: Steer): { ticks: number; x: number } {
  let b = ball;
  let ticks = 0;
  while (!crossedPlate(b)) {
    b = stepPitch(b, kind, steer);
    ticks++;
  }
  return { ticks, x: b.pos.x };
}

const between = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);

// 1つのセッションを CPU として動かす。毎ステップ、セッションの step() の前に呼ぶ
export class CpuBaseballPlayer {
  private style: Style;
  private thinkLeft: number | null = null;
  // 今の投球の狙い（投手）
  private target = 0;
  private steers = false;
  // 今の投球への構え（打者）
  private plannedN = 0;
  private timing = 0;
  private decided = false;

  constructor(
    private session: BaseballSession,
    private level: BbCpuLevel,
    private rng: () => number,
  ) {
    this.style = STYLES[level];
  }

  step() {
    const v = this.session.view();
    if (v.role === 'pitcher') this.pitcherStep(v.phase);
    else if (v.role === 'batter') this.batterStep(v.phase);
  }

  private pitcherStep(p: ReturnType<BaseballSession['view']>['phase']) {
    if (p.kind === 'ready') {
      if (this.thinkLeft === null) this.thinkLeft = Math.round(between(this.rng, ...this.style.think));
      if (--this.thinkLeft > 0) return;
      this.thinkLeft = null;
      this.planPitch();
      return;
    }
    if (p.kind !== 'pitching') return;
    if (!this.steers) return;
    // 曲げずに進んだときの通過点が狙いに近づく向きへ曲げる
    const x = predictCross(p.ball, p.pitchKind, 0).x;
    const diff = this.target - x;
    this.session.steer(Math.abs(diff) < STEER_DEADBAND ? 0 : diff > 0 ? 1 : -1);
  }

  private planPitch() {
    const r = this.rng;
    let kind: PitchKind;
    if (this.level === 'weak') {
      kind = r() < 0.7 ? 'straight' : 'change';
      this.target = 0;
      this.steers = false;
    } else if (this.level === 'normal') {
      kind = PITCH_KINDS[Math.floor(r() * PITCH_KINDS.length)];
      this.target = between(r, -6, 6);
      this.steers = true;
    } else {
      // ゾーンの際（少し外れることもある）を、曲げ続けて狙う。打者は曲げがないものとして読むので打ちにくい
      kind = PITCH_KINDS[Math.floor(r() * PITCH_KINDS.length)];
      this.target = (r() < 0.5 ? -1 : 1) * between(r, 2.5, 5.5);
      this.steers = true;
    }
    this.session.selectKind(kind);
    this.session.pitch();
  }

  private batterStep(p: ReturnType<BaseballSession['view']>['phase']) {
    if (p.kind !== 'pitching' || p.swingTick !== null) return;
    if (p.n !== this.plannedN) {
      this.plannedN = p.n;
      this.decided = false;
      const e = this.style.timingError;
      this.timing = Math.round(between(this.rng, -e, e));
    }
    if (this.decided) return;
    // 曲げはこの先ないものとして読む（遅く曲げる球にはだまされる）
    const { ticks, x } = predictCross(p.ball, p.pitchKind, 0);
    // 芯（振り始めから SWING_TICKS/2 後）が通過に重なるよう、timing だけずらして振る。
    // 本塁を通った後には振れないので、遅れすぎのときは通過の直前に振る
    if (ticks > Math.max(1, SWING_TICKS / 2 + this.timing)) return;
    this.decided = true;
    if (Math.abs(x) <= PLATE_HALF + this.style.chase) this.session.swing();
  }
}

// 同じブラウザの中で2つのセッションをつなぐ。送ったメッセージは flush() で相手に届く
export function pairSessions() {
  const queues: BbMsg[][] = [[], []];
  const sessions = [
    new BaseballSession(0, (m) => queues[1].push(m)),
    new BaseballSession(1, (m) => queues[0].push(m)),
  ] as const;
  return {
    sessions,
    flush() {
      sessions.forEach((s, i) => {
        const q = queues[i].splice(0);
        for (const m of q) s.receive(m);
      });
    },
  };
}

// 人（席0・先攻）と CPU（席1）の試合。画面は session だけを見て、毎ステップ step() を呼ぶ
export class CpuMatch {
  readonly session: BaseballSession;
  readonly opponent: BaseballSession;
  private pair = pairSessions();
  private cpu: CpuBaseballPlayer;

  constructor(level: BbCpuLevel, rng: () => number) {
    [this.session, this.opponent] = this.pair.sessions;
    this.cpu = new CpuBaseballPlayer(this.opponent, level, rng);
  }

  step() {
    this.pair.flush();
    this.cpu.step();
    this.session.step();
    this.opponent.step();
  }
}
