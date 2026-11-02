import { createRng } from '../src/core/rng';
import { type BbCpuLevel, CpuBaseballPlayer, CpuMatch, pairSessions } from '../src/baseball/cpu';
import type { PitchResult } from '../src/baseball/rules';
import type { BaseballSession } from '../src/baseball/session';

const CONTACT: PitchResult[] = ['foul', 'single', 'double', 'triple', 'homer', 'out'];

// 席 cpuSeat を CPU、もう一方を「まっすぐだけ投げ、決して振らない」人にして試合を回す。
// 人が見た1球ごとの結果を、人の役割（その球で投手だったか打者だったか）付きで集める
function play(level: BbCpuLevel, seed: number, cpuSeat: 0 | 1, maxPitches = Infinity) {
  const pair = pairSessions();
  const cpuSide = pair.sessions[cpuSeat];
  const human: BaseballSession = pair.sessions[cpuSeat === 0 ? 1 : 0];
  const cpu = new CpuBaseballPlayer(cpuSide, level, createRng(seed));
  const seen: { humanRole: 'pitcher' | 'batter'; result: PitchResult }[] = [];
  let before = human.view();
  for (let i = 0; i < 2_000_000 && !before.state.outcome && seen.length < maxPitches; i++) {
    pair.flush();
    if (before.role === 'pitcher' && before.phase.kind === 'ready') human.pitch();
    cpu.step();
    human.step();
    cpuSide.step();
    const after = human.view();
    // 結果が入ると state が新しいオブジェクトになる
    if (after.state !== before.state && after.lastResult && before.role !== 'none') {
      seen.push({ humanRole: before.role, result: after.lastResult });
    }
    before = after;
  }
  return seen;
}

describe('CPU', () => {
  test('CPU 同士で1試合を最後まで遊ぶと、3イニングで決着し両者の状態が一致する', () => {
    const match = new CpuMatch('normal', createRng(1));
    const other = new CpuBaseballPlayer(match.session, 'normal', createRng(2));
    const over = () => match.session.view().state.outcome !== null && match.session.view().phase.kind === 'ready';
    for (let i = 0; i < 2_000_000 && !over(); i++) {
      other.step();
      match.step();
    }
    const s = match.session.view().state;
    expect(s.outcome?.reason).toBe('innings');
    expect(match.opponent.view().state).toEqual(s);
  });

  test('CPU は少し考えてから投げる', () => {
    const match = new CpuMatch('strong', createRng(3));
    for (let i = 0; i < 10; i++) match.step();
    // 先攻はあなたなので、最初は CPU が投手
    expect(match.session.view().role).toBe('batter');
    expect(match.session.view().phase.kind).toBe('ready');
    for (let i = 0; i < 300 && match.session.view().phase.kind === 'ready'; i++) match.step();
    expect(match.session.view().phase.kind).toBe('pitching');
  });

  test('つよい打者ほど、まっすぐの球によく当てる', () => {
    const rate = (level: BbCpuLevel) => {
      const rs = [1, 2, 3].flatMap((seed) => play(level, seed, 0)).filter((s) => s.humanRole === 'pitcher');
      return rs.filter((s) => CONTACT.includes(s.result)).length / rs.length;
    };
    const weak = rate('weak');
    const strong = rate('strong');
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.8);
  });

  test('よわい投手は曲げずにストライクを投げ、つよい投手はゾーンの際を狙ってボールも混ざる', () => {
    const taken = (level: BbCpuLevel, seed: number) =>
      play(level, seed, 1, 12)
        .filter((s) => s.humanRole === 'batter')
        .map((s) => s.result);
    const weak = taken('weak', 4);
    expect(weak.length).toBeGreaterThan(0);
    expect(weak.every((r) => r === 'strike')).toBe(true);
    const strong = [5, 6, 7].flatMap((seed) => taken('strong', seed));
    expect(strong).toContain('ball');
    expect(strong).toContain('strike');
  });
});
