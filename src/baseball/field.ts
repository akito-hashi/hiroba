// トイベースボールの盤と2D物理。本塁が (0,0)、+y が中堅方向、+x が一塁側。
// 乱数も時刻も使わない純粋関数なので、打者と投手のブラウザで同じ初速から同じ結果になる。
import type { PitchResult } from './rules';

export const TICK_SEC = 1 / 120;
export const MOUND_Y = 40; // 投球マシンの位置（x=0）
export const FENCE_R = 100; // 奥の壁までの距離
export const INFIELD_R = 45; // これより内側で止まればゴロアウト
export const FOUL_ANGLE = Math.PI / 4; // センターからの角度がこれを超えたらファウル
export const PLATE_HALF = 4; // ストライクゾーン（本塁の幅の半分）
export const BAT_REACH = 6; // バットが届く |x|
export const SWING_TICKS = 12; // 振り始めから振り終わりまで。中ほど（6）が芯のタイミング
export const TIMING_WINDOW = 8; // 芯のタイミングから前後何ステップまで当たるか

export const STEER_ACCEL = 30; // 曲げ入力の加速度
export const FRICTION = 40; // 打球の減速（単位/秒²）
const STOP_SPEED = 0.5; // これ未満の速さで停止
const MAX_HIT_ANGLE = (55 * Math.PI) / 180; // 芯から TIMING_WINDOW ずれたときの打球角

export type PitchKind = 'straight' | 'curve' | 'shoot' | 'change';
export const PITCH_KINDS: PitchKind[] = ['straight', 'curve', 'shoot', 'change'];
export const PITCH_LABELS: Record<PitchKind, string> = {
  straight: 'ストレート',
  curve: 'カーブ',
  shoot: 'シュート',
  change: 'チェンジアップ',
};
export type Steer = -1 | 0 | 1;
export type Vec = { x: number; y: number };
export type Ball = { pos: Vec; vel: Vec };

const PITCH_SPEED: Record<PitchKind, number> = { straight: 80, curve: 60, shoot: 60, change: 40 };
const PITCH_BEND: Record<PitchKind, number> = { straight: 0, curve: 25, shoot: -25, change: 0 };

// 曲げなければ本塁の真ん中（x≈0）に来るよう、曲がりの逆向きの初速を付けて投げ出す
export function launchPitch(kind: PitchKind): Ball {
  const speed = PITCH_SPEED[kind];
  const flight = MOUND_Y / speed;
  return {
    pos: { x: 0, y: MOUND_Y },
    vel: { x: -0.5 * PITCH_BEND[kind] * flight, y: -speed },
  };
}

// 1ステップ進める。steer は投手の曲げ（そのステップで効いている値）
export function stepPitch(ball: Ball, kind: PitchKind, steer: Steer): Ball {
  const ax = PITCH_BEND[kind] + steer * STEER_ACCEL;
  const vel = { x: ball.vel.x + ax * TICK_SEC, y: ball.vel.y };
  return { pos: { x: ball.pos.x + vel.x * TICK_SEC, y: ball.pos.y + vel.y * TICK_SEC }, vel };
}

// 球が本塁（y<=0）を通過したか
export const crossedPlate = (ball: Ball): boolean => ball.pos.y <= 0;

export type Contact = { hit: false } | { hit: true; launch: Vec }; // launch は打球の初速

// スイング判定。swingTick は振り始めたステップ、crossTick と crossX は球が y=0 を通ったステップと x
export function judgeSwing(swingTick: number, crossTick: number, crossX: number, kind: PitchKind): Contact {
  const offset = crossTick - (swingTick + SWING_TICKS / 2); // 正なら早振り
  const d = Math.abs(offset);
  if (d > TIMING_WINDOW || Math.abs(crossX) > BAT_REACH) return { hit: false };
  const angle = (-offset / TIMING_WINDOW) * MAX_HIT_ANGLE; // 早振りほど左（-x）へ
  const speed =
    (120 + 0.5 * PITCH_SPEED[kind]) * (1 - (0.5 * d) / TIMING_WINDOW) * (1 - (0.3 * Math.abs(crossX)) / BAT_REACH);
  return { hit: true, launch: { x: speed * Math.sin(angle), y: speed * Math.cos(angle) } };
}

export type HitResult = Exclude<PitchResult, 'ball' | 'strike'>;
export type FieldEvent = { kind: 'moving' } | { kind: 'done'; result: HitResult };

export type Cup = { x: number; y: number; r: number };
// 守備人形の受け皿。内野2人（二塁手・遊撃手）は土の内野の中、
// 外野3人（左翼・中堅・右翼）は壁の手前。投手は投球マシンなので守らない。
// 一塁手・三塁手は置かず、線寄りの打球をヒットにしやすくしている。
// 内野2人は、フェアゾーンの右半分・左半分それぞれの真ん中（センターから左右 22.5°）、本塁から 38 の位置
const INFIELD_ANGLE = Math.PI / 8;
const INFIELD_DIST = 38;
export const CUPS: Cup[] = [
  { x: INFIELD_DIST * Math.sin(INFIELD_ANGLE), y: INFIELD_DIST * Math.cos(INFIELD_ANGLE), r: 4 },
  { x: -INFIELD_DIST * Math.sin(INFIELD_ANGLE), y: INFIELD_DIST * Math.cos(INFIELD_ANGLE), r: 4 },
  { x: -45, y: 75, r: 4 },
  { x: 0, y: 88, r: 4 },
  { x: 45, y: 75, r: 4 },
];
// 壁の区画。左（三塁側）から。-45°〜+45° を等分する
export const WALL_SEGMENTS: ('triple' | 'double' | 'single' | 'homer')[] = [
  'triple', 'double', 'single', 'homer', 'single', 'double', 'triple',
];

// 打球を1ステップ転がし、何かに入ったか・止まったかを返す
export function stepHit(ball: Ball): { ball: Ball; event: FieldEvent } {
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  const slowed = Math.max(0, speed - FRICTION * TICK_SEC);
  const k = speed > 0 ? slowed / speed : 0;
  const vel = { x: ball.vel.x * k, y: ball.vel.y * k };
  const pos = { x: ball.pos.x + vel.x * TICK_SEC, y: ball.pos.y + vel.y * TICK_SEC };
  const next = { pos, vel };
  const done = (result: HitResult) => ({ ball: next, event: { kind: 'done', result } as FieldEvent });

  const angle = Math.atan2(pos.x, pos.y); // +y から測った角度（右が正）
  if (pos.y < 0 || Math.abs(angle) > FOUL_ANGLE) return done('foul');
  if (CUPS.some((c) => Math.hypot(pos.x - c.x, pos.y - c.y) < c.r)) return done('out');
  const dist = Math.hypot(pos.x, pos.y);
  if (dist >= FENCE_R) {
    const n = WALL_SEGMENTS.length;
    const i = Math.min(n - 1, Math.max(0, Math.floor(((angle + FOUL_ANGLE) / (2 * FOUL_ANGLE)) * n)));
    return done(WALL_SEGMENTS[i]);
  }
  if (slowed < STOP_SPEED) return done(dist < INFIELD_R ? 'out' : 'single');
  return { ball: next, event: { kind: 'moving' } };
}

// 打球の初速から最後まで転がした結果（テスト・投手側の再生で使う）
export function simulateHit(launch: Vec): { path: Vec[]; result: HitResult } {
  let ball: Ball = { pos: { x: 0, y: 0 }, vel: launch };
  const path: Vec[] = [ball.pos];
  for (;;) {
    const step = stepHit(ball);
    ball = step.ball;
    path.push(ball.pos);
    if (step.event.kind === 'done') return { path, result: step.event.result };
  }
}
