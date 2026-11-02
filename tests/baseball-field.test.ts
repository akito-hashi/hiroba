import {
  BAT_REACH, CUPS, FENCE_R, FOUL_ANGLE, FRICTION, INFIELD_R, PITCH_KINDS, PLATE_HALF,
  SWING_TICKS, TIMING_WINDOW, WALL_SEGMENTS, crossedPlate, judgeSwing, launchPitch, simulateHit,
  stepPitch,
  type PitchKind, type Steer, type Vec,
} from '../src/baseball/field';

// 本塁に着くまで回して、そのときの球とステップ数を返す
function throwPitch(kind: PitchKind, steer: Steer) {
  let ball = launchPitch(kind);
  let ticks = 0;
  while (!crossedPlate(ball) && ticks < 10000) {
    ball = stepPitch(ball, kind, steer);
    ticks++;
  }
  return { ball, ticks };
}

// +y から測った角度（右が正）と速さから初速を作る
const launchAt = (deg: number, speed: number): Vec => {
  const a = (deg * Math.PI) / 180;
  return { x: speed * Math.sin(a), y: speed * Math.cos(a) };
};
const len = (v: Vec) => Math.hypot(v.x, v.y);
const SEG_DEG = 90 / 7;

// 指定の角度の範囲で、受け皿を避けて壁まで届く（本塁打になる）角度を探す
function findHomerAngle(from: number, to: number): number | undefined {
  for (let d = from; d <= to; d += 0.05) {
    if (simulateHit(launchAt(d, 160)).result === 'homer') return d;
  }
  return undefined;
}

describe('投球', () => {
  it('曲げなければどの球種も本塁の真ん中付近を通る', () => {
    for (const kind of PITCH_KINDS) {
      expect(Math.abs(throwPitch(kind, 0).ball.pos.x)).toBeLessThan(PLATE_HALF / 2);
    }
  });

  it('曲げ続けるとストライクゾーンを外れる', () => {
    for (const kind of PITCH_KINDS.filter((k) => k !== 'straight')) {
      expect(throwPitch(kind, 1).ball.pos.x).toBeGreaterThan(PLATE_HALF);
      expect(throwPitch(kind, -1).ball.pos.x).toBeLessThan(-PLATE_HALF);
    }
  });

  it('ストレートが一番速く、チェンジアップが一番遅い', () => {
    const t = (k: PitchKind) => throwPitch(k, 0).ticks;
    expect(t('straight')).toBeLessThan(t('curve'));
    expect(t('curve')).toBeLessThan(t('change'));
  });
});

describe('スイング判定', () => {
  const core = SWING_TICKS / 2;

  it('芯のタイミングで真ん中に当たればセンターへ強く飛ぶ', () => {
    const c = judgeSwing(0, core, 0, 'straight');
    expect(c.hit).toBe(true);
    if (c.hit) {
      expect(Math.abs(c.launch.x)).toBeLessThan(1e-9);
      expect(c.launch.y).toBeGreaterThan(0);
    }
  });

  it('早振りは三塁側、遅振りは一塁側へ', () => {
    const early = judgeSwing(0, core + 4, 0, 'straight');
    const late = judgeSwing(0, core - 4, 0, 'straight');
    expect(early.hit && early.launch.x).toBeLessThan(0);
    expect(late.hit && late.launch.x).toBeGreaterThan(0);
  });

  it('タイミングが外れるか、バットが届かなければ空振り', () => {
    expect(judgeSwing(0, core + TIMING_WINDOW + 1, 0, 'straight').hit).toBe(false);
    expect(judgeSwing(0, core, BAT_REACH + 1, 'straight').hit).toBe(false);
  });

  it('芯から外れるほど打球は弱い', () => {
    const a = judgeSwing(0, core, 0, 'straight');
    const b = judgeSwing(0, core + 4, 0, 'straight');
    expect(a.hit && b.hit).toBe(true);
    if (a.hit && b.hit) expect(len(b.launch)).toBeLessThan(len(a.launch));
  });
});

describe('打球', () => {
  it('強い打球がセンターの受け皿の間を抜ければ壁の区画で決まる', () => {
    // 中央区画は左右どちらの半分にも受け皿を避けて届く
    expect(findHomerAngle(-SEG_DEG / 2, 0)).toBeDefined();
    expect(findHomerAngle(0, SEG_DEG / 2)).toBeDefined();
    let triple = false;
    for (let d = -45; d < -45 + SEG_DEG; d += 0.05) {
      if (simulateHit(launchAt(d, 160)).result === 'triple') triple = true;
    }
    expect(triple).toBe(true);
  });

  it('受け皿に向かう打球はアウト', () => {
    expect(simulateHit({ x: 0, y: 160 }).result).toBe('out');
  });

  it('ファウルラインの外へ出ればファウル', () => {
    expect(FOUL_ANGLE).toBeCloseTo(Math.PI / 4);
    expect(simulateHit(launchAt(50, 160)).result).toBe('foul');
    expect(simulateHit(launchAt(-50, 160)).result).toBe('foul');
  });

  it('内野で止まればアウト、外野で止まればヒット', () => {
    // 角度 8° は受け皿の間を抜ける。止まる距離は v²/(2·摩擦) で逆算
    const speedFor = (dist: number) => Math.sqrt(2 * FRICTION * dist);
    expect(simulateHit(launchAt(8, speedFor(INFIELD_R - 10))).result).toBe('out');
    expect(simulateHit(launchAt(8, speedFor((INFIELD_R + FENCE_R) / 2))).result).toBe('single');
  });

  it('同じ初速からは同じ結果になる', () => {
    const v = launchAt(10, 120);
    expect(simulateHit(v)).toEqual(simulateHit(v));
  });
});

describe('盤', () => {
  it('壁の区画は左から 3・2・1・王冠・1・2・3', () => {
    expect(WALL_SEGMENTS).toEqual(['triple', 'double', 'single', 'homer', 'single', 'double', 'triple']);
  });

  it('内野の2人は、フェアゾーンの右半分・左半分それぞれの真ん中（センターから左右22.5°）に左右対称に立つ', () => {
    const infield = CUPS.filter((c) => Math.hypot(c.x, c.y) < INFIELD_R);
    const angles = infield.map((c) => (Math.atan2(c.x, c.y) * 180) / Math.PI).sort((a, b) => a - b);
    expect(angles[0]).toBeCloseTo(-22.5, 1);
    expect(angles[1]).toBeCloseTo(22.5, 1);
    expect(infield[0].y).toBeCloseTo(infield[1].y, 5);
  });

  it('受け皿は内野に2つ、外野に3つ（投手は投球マシンなので守らない）', () => {
    const dist = (c: { x: number; y: number }) => Math.hypot(c.x, c.y);
    expect(CUPS.filter((c) => dist(c) < INFIELD_R)).toHaveLength(2);
    expect(CUPS.filter((c) => dist(c) >= INFIELD_R)).toHaveLength(3);
  });
});
