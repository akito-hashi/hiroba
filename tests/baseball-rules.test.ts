import { applyResult, battingSide, forfeit, initialState, type BaseballState, type PitchResult } from '../src/baseball/rules';

const apply = (s: BaseballState, ...rs: PitchResult[]) => rs.reduce(applyResult, s);
const times = (r: PitchResult, n: number): PitchResult[] => Array<PitchResult>(n).fill(r);
// 指定の回・表裏の頭の状態を作る
const at = (inning: number, half: 'top' | 'bottom', score: [number, number] = [0, 0]): BaseballState => ({
  ...initialState(),
  inning,
  half,
  score,
});

describe('baseball rules', () => {
  it('4ボールで一塁へ。押し出しのときだけ走者が進む', () => {
    const one = apply(initialState(), 'single', ...times('ball', 4));
    expect(one.bases).toEqual([true, true, false]);
    const full = apply({ ...initialState(), bases: [true, true, true] }, ...times('ball', 4));
    expect(full.score[0]).toBe(1);
    expect(full.bases).toEqual([true, true, true]);
  });

  it('3ストライクで三振、3アウトで攻守交代', () => {
    const s = apply(initialState(), ...times('strike', 3));
    expect(s.outs).toBe(1);
    expect([s.balls, s.strikes]).toEqual([0, 0]);
    const t = apply(s, 'out', 'out');
    expect(t.half).toBe('bottom');
    expect(t.outs).toBe(0);
    expect(t.bases).toEqual([false, false, false]);
  });

  it('ファウルは2ストライク未満のときだけストライクに数える', () => {
    expect(apply(initialState(), ...times('foul', 3)).strikes).toBe(2);
  });

  it('ヒットは全員1つ、二塁打2つ、三塁打3つ進み、本塁を越えた走者が得点', () => {
    const d = applyResult({ ...initialState(), bases: [true, false, true] }, 'double');
    expect(d.score[0]).toBe(1);
    expect(d.bases).toEqual([false, true, true]);
    const t = applyResult({ ...initialState(), bases: [false, true, false] }, 'triple');
    expect(t.score[0]).toBe(1);
    expect(t.bases).toEqual([false, false, true]);
  });

  it('ホームランで走者と打者が全員生還', () => {
    const s = applyResult({ ...initialState(), bases: [true, true, true] }, 'homer');
    expect(s.score[0]).toBe(4);
    expect(s.bases).toEqual([false, false, false]);
  });

  it('打席が終わるとカウントが戻る', () => {
    const s = apply(initialState(), 'ball', 'strike', 'single');
    expect([s.balls, s.strikes]).toEqual([0, 0]);
  });

  it('3回裏が終わると決着。同点なら引き分け', () => {
    const s = apply(at(3, 'bottom'), ...times('out', 3));
    expect(s.outcome).toEqual({ winner: 'draw', reason: 'innings' });
  });

  it('3回表が終わって後攻がリードしていれば3回裏は行わない', () => {
    const s = apply(at(3, 'top', [0, 1]), ...times('out', 3));
    expect(s.outcome?.winner).toBe(1);
  });

  it('3回裏に後攻が勝ち越したらその場で終わる', () => {
    const s = apply(at(3, 'bottom'), 'homer');
    expect(s.outcome?.winner).toBe(1);
    expect(s.outs).toBe(0);
  });

  it('3回裏の四球・単打でも勝ち越しならその場で終わる', () => {
    const loaded: BaseballState = { ...at(3, 'bottom'), bases: [true, true, true] };
    expect(applyResult(loaded, 'single').outcome?.winner).toBe(1);
    expect(apply(loaded, ...times('ball', 4)).outcome?.winner).toBe(1);
  });

  it('決着後は結果を入れても変わらない', () => {
    const done = apply(at(3, 'bottom'), 'homer');
    expect(applyResult(done, 'homer')).toEqual(done);
    expect(forfeit(done, 1, 'disconnect')).toEqual(done);
  });

  it('切断・放置は相手の勝ち', () => {
    expect(forfeit(initialState(), 0, 'stalled').outcome).toEqual({ winner: 1, reason: 'stalled' });
  });

  it('表は先攻が打つ', () => {
    expect(battingSide(initialState())).toBe(0);
    expect(battingSide(at(1, 'bottom'))).toBe(1);
  });
});
