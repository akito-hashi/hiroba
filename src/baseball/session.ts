import {
  type Ball,
  crossedPlate,
  judgeSwing,
  launchPitch,
  PLATE_HALF,
  type PitchKind,
  simulateHit,
  type Steer,
  stepPitch,
  TICK_SEC,
  type Vec,
} from './field';
import type { BbMsg } from './protocol';
import {
  applyResult,
  type BaseballState,
  battingSide,
  forfeit,
  initialState,
  type PitchResult,
  type Side,
} from './rules';

// 投手の結果表示を見せる時間。この間は次を投げられない
export const RESULT_PAUSE_TICKS = 90;

export type Phase =
  | { kind: 'ready' } // 投球待ち
  | { kind: 'pitching'; n: number; pitchKind: PitchKind; ball: Ball; tick: number; swingTick: number | null }
  | { kind: 'waiting'; n: number } // 投手の手元で球が本塁を通過し、打者の判定を待っている
  | { kind: 'rolling'; n: number; ball: Ball; path: Vec[]; index: number } // 打球の再生（両者）
  | { kind: 'pause'; ticksLeft: number }; // 結果表示

export type View = {
  me: Side;
  role: 'pitcher' | 'batter' | 'none'; // 試合終了後は none
  state: BaseballState;
  phase: Phase;
  selectedKind: PitchKind; // 投手が選んでいる球種
  lastResult: PitchResult | null; // 直近の1球の結果（演出用）
  waitingForOpponent: boolean; // 90秒待ちの対象（投手の結果待ち・打者の投球待ち）
};

// 1人分の対戦の進行。画面と通信からは切り離してある。
// 判定は打者のブラウザが行い、投手は結果を受け取って同じカウントを入れる。
// 球の動きは画面が毎フレーム view() で読むので、onChange は表示が切り替わるときだけ呼ぶ。
export class BaseballSession {
  onChange: () => void = () => {};
  private state = initialState();
  private phase: Phase = { kind: 'ready' };
  private selectedKind: PitchKind = 'straight';
  private lastResult: PitchResult | null = null;
  private lastN = 0; // 最後に投げた・受けた投球番号（試合を通して両者で共通）
  private steerDir: Steer = 0; // 今の投球で効いている曲げ
  private sentSteer: Steer = 0; // 投手が最後に送った曲げ
  private opp: Side;

  constructor(
    readonly me: Side,
    private send: (m: BbMsg) => void,
  ) {
    this.opp = me === 0 ? 1 : 0;
  }

  view(): View {
    const role = this.role();
    return {
      me: this.me,
      role,
      state: this.state,
      phase: this.phase,
      selectedKind: this.selectedKind,
      lastResult: this.lastResult,
      waitingForOpponent:
        (role === 'batter' && this.phase.kind === 'ready') || (role === 'pitcher' && this.phase.kind === 'waiting'),
    };
  }

  selectKind(kind: PitchKind) {
    if (this.role() !== 'pitcher' || this.selectedKind === kind) return;
    this.selectedKind = kind;
    this.onChange();
  }

  pitch() {
    if (this.role() !== 'pitcher' || this.phase.kind !== 'ready') return;
    const n = ++this.lastN;
    this.startPitch(n, this.selectedKind);
    this.send({ t: 'pitch', n, kind: this.selectedKind });
    this.onChange();
  }

  steer(dir: Steer) {
    if (this.role() !== 'pitcher' || this.phase.kind !== 'pitching') return;
    this.steerDir = dir;
    if (dir === this.sentSteer) return;
    this.sentSteer = dir;
    this.send({ t: 'steer', n: this.phase.n, dir });
  }

  swing() {
    if (this.role() !== 'batter' || this.phase.kind !== 'pitching' || this.phase.swingTick !== null) return;
    this.phase = { ...this.phase, swingTick: this.phase.tick };
  }

  step() {
    const p = this.phase;
    switch (p.kind) {
      case 'pitching': {
        const ball = stepPitch(p.ball, p.pitchKind, this.steerDir);
        const tick = p.tick + 1;
        if (!crossedPlate(ball)) {
          this.phase = { ...p, ball, tick };
          return;
        }
        if (this.role() === 'batter') this.judge(p.n, p.pitchKind, ball, tick, p.swingTick);
        // 投手は球を消して、打者の判定を待つ
        else this.phase = { kind: 'waiting', n: p.n };
        this.onChange();
        return;
      }
      case 'rolling': {
        // 最後の点まで見せてから結果表示へ
        if (p.index >= p.path.length - 1) {
          this.toPause();
          this.onChange();
          return;
        }
        const index = p.index + 1;
        this.phase = { ...p, index, ball: pathBall(p.path, index) };
        return;
      }
      case 'pause':
        if (p.ticksLeft > 1) {
          this.phase = { kind: 'pause', ticksLeft: p.ticksLeft - 1 };
          return;
        }
        this.phase = { kind: 'ready' };
        this.onChange();
        return;
    }
  }

  receive(m: BbMsg) {
    const role = this.role();
    const p = this.phase;
    switch (m.t) {
      case 'pitch':
        // 前の打球の再生や結果表示の途中でも打ち切って受ける
        if (role !== 'batter' || m.n <= this.lastN) return;
        this.lastN = m.n;
        this.startPitch(m.n, m.kind);
        break;
      case 'steer':
        if (role !== 'batter' || p.kind !== 'pitching' || p.n !== m.n) return;
        this.steerDir = m.dir;
        return;
      case 'result':
        if (role !== 'pitcher' || (p.kind !== 'pitching' && p.kind !== 'waiting') || p.n !== m.n) return;
        this.record(m.result);
        this.startReplay(m.n, m.launch && simulateHit(m.launch).path);
        break;
    }
    this.onChange();
  }

  opponentLeft() {
    this.giveUpOnOpponent('disconnect');
  }

  opponentStalled() {
    this.giveUpOnOpponent('stalled');
  }

  private role(): View['role'] {
    if (this.state.outcome) return 'none';
    return battingSide(this.state) === this.me ? 'batter' : 'pitcher';
  }

  private startPitch(n: number, kind: PitchKind) {
    this.steerDir = 0;
    this.sentSteer = 0;
    this.phase = { kind: 'pitching', n, pitchKind: kind, ball: launchPitch(kind), tick: 0, swingTick: null };
  }

  // 打者の判定。スイングが本塁通過より後なら、ここには来ない（未スイングとして判定される）
  private judge(n: number, kind: PitchKind, ball: Ball, tick: number, swingTick: number | null) {
    let result: PitchResult;
    let launch: Vec | null = null;
    let path: Vec[] | null = null;
    if (swingTick !== null) {
      const contact = judgeSwing(swingTick, tick, ball.pos.x, kind);
      if (contact.hit) {
        launch = contact.launch;
        const hit = simulateHit(launch);
        result = hit.result;
        path = hit.path;
      } else result = 'strike';
    } else {
      result = Math.abs(ball.pos.x) <= PLATE_HALF ? 'strike' : 'ball';
    }
    this.record(result);
    this.send({ t: 'result', n, result, launch });
    this.startReplay(n, path);
  }

  private record(result: PitchResult) {
    this.state = applyResult(this.state, result);
    this.lastResult = result;
  }

  private startReplay(n: number, path: Vec[] | null) {
    if (path) this.phase = { kind: 'rolling', n, ball: pathBall(path, 0), path, index: 0 };
    else this.toPause();
  }

  private toPause() {
    this.phase = { kind: 'pause', ticksLeft: RESULT_PAUSE_TICKS };
  }

  private giveUpOnOpponent(reason: 'disconnect' | 'stalled') {
    if (this.state.outcome) return;
    this.state = forfeit(this.state, this.opp, reason);
    // 投げている途中の球は止める（打球の再生と結果表示はそのまま続ける）
    if (this.phase.kind === 'pitching' || this.phase.kind === 'waiting') this.phase = { kind: 'ready' };
    this.onChange();
  }
}

// 打球の軌跡の index 番目の点を、速度付きの球にする
function pathBall(path: Vec[], index: number): Ball {
  const pos = path[index];
  const prev = path[Math.max(0, index - 1)];
  return { pos, vel: { x: (pos.x - prev.x) / TICK_SEC, y: (pos.y - prev.y) / TICK_SEC } };
}
