import { GOAL, LAST_TRACK, LudoGame, type LudoState, START_POS, TRACK, absolutePos, colorsFor } from '../src/ludo/rules';

// 出目を順に返す乱数（サイコロ = floor(rng*6)+1）
const dice = (...faces: number[]) => {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 6 + 0.01;
};

// 状態を直接作って試す
function gameWith(pieces: number[][], faces: number[], current = 0) {
  const g = new LudoGame(
    pieces.map((_, i) => `p${i}`),
    current,
    dice(...faces),
  );
  const s = g.state();
  pieces.forEach((p, i) => (s.players[i].pieces = [...p]));
  return LudoGame.restore({ ...s, current }, dice(...faces));
}

describe('色の割り当て', () => {
  test('2人は向かい合う色、3人と4人は順に', () => {
    expect(colorsFor(2)).toEqual([0, 2]);
    expect(colorsFor(3)).toEqual([0, 1, 2]);
    expect(colorsFor(4)).toEqual([0, 1, 2, 3]);
  });

  test('盤上の位置は色ごとのスタートからずれる', () => {
    expect(absolutePos(0, 0)).toBe(0);
    expect(absolutePos(1, 0)).toBe(10);
    expect(absolutePos(3, 20)).toBe((30 + 20) % 40);
  });

  test('盤: 1周40マス、ゴールへの道4マス', () => {
    expect([TRACK, LAST_TRACK, GOAL]).toEqual([40, 39, 43]);
    expect(START_POS).toEqual([0, 10, 20, 30]);
  });
});

describe('スタート', () => {
  test('ゲームの最初は、全員がコマを1つずつスタートのマスに出している', () => {
    const g = new LudoGame(['a', 'b', 'c'], 0, dice(3));
    for (const p of g.state().players) expect(p.pieces).toEqual([0, -1, -1, -1]);
  });

  test('6が出たらコマを盤に出せ、もう一度振れる', () => {
    const g = new LudoGame(['a', 'b'], 0, dice(6));
    expect(g.roll(0)).toBe(true);
    expect(g.legalMoves()).toEqual([0, 1, 2, 3]);
    expect(g.move(0, 1)).toBe(true);
    const s = g.state();
    expect(s.players[0].pieces[1]).toBe(0);
    expect(s.current).toBe(0);
    expect(s.phase).toBe('roll');
  });

  test('盤にコマがないとき6以外なら、振れるのは1回で次の人の番', () => {
    const g = gameWith([[-1, -1, -1, -1], [-1, -1, -1, -1]], [3]);
    g.roll(0);
    const s = g.state();
    expect(s.current).toBe(1);
    expect(s.phase).toBe('roll');
    expect(s.dice).toBe(3);
  });

  test('ほかのコマが動かせなくても、6ならスタートのコマは出せる', () => {
    // 1つはゴール直前で行き過ぎる、残りはスタート
    const g = gameWith([[42, -1, -1, -1], [-1, -1, -1, -1]], [6]);
    g.roll(0);
    expect(g.legalMoves()).toEqual([1, 2, 3]);
  });
});

describe('移動とゴール', () => {
  test('ゴールにはぴったりでしか入れない', () => {
    const g = gameWith([[41, GOAL, GOAL, GOAL], [-1, -1, -1, -1]], [3]);
    g.roll(0);
    // 行き過ぎて動かせるコマがないので次の人へ
    expect(g.state().current).toBe(1);
    const h = gameWith([[41, GOAL, GOAL, GOAL], [-1, -1, -1, -1]], [2]);
    h.roll(0);
    h.move(0, 0);
    const s = h.state();
    expect(s.ended).toBe(true);
    expect(s.winner).toBe(0);
  });

  test('本当に何も動かせなければ、6でももう一度は振れない', () => {
    const g = gameWith([[53, GOAL, GOAL, GOAL], [-1, -1, -1, -1]], [6]);
    g.roll(0);
    expect(g.state().current).toBe(1);
  });

  test('手番でない人は振れず、振る前に動かせない', () => {
    const g = new LudoGame(['a', 'b'], 0, dice(6));
    expect(g.roll(1)).toBe(false);
    expect(g.move(0, 0)).toBe(false);
    g.roll(0);
    expect(g.move(0, 0)).toBe(true);
    expect(g.move(0, 1)).toBe(false); // 振り直す前にもう1回は動かせない
  });

  test('動かせないコマは選べない', () => {
    const g = gameWith([[10, -1, -1, -1], [-1, -1, -1, -1]], [4]);
    g.roll(0);
    expect(g.legalMoves()).toEqual([0]);
    expect(g.move(0, 1)).toBe(false);
  });
});

describe('蹴落とし', () => {
  test('相手のコマにぴったり止まると相手はスタートへ戻る', () => {
    // 赤(0)の 10 → 14 は盤上 14。黄(2)の位置 (20 + p) % 40 = 14 → p = 34
    const g = gameWith([[10, -1, -1, -1], [34, -1, -1, -1]], [4]);
    g.roll(0);
    g.move(0, 0);
    expect(g.state().players[1].pieces[0]).toBe(-1);
  });

  test('安全なマス（各色のスタート）では戻らない', () => {
    // 赤の 6 → 10 は盤上 10（緑のスタート＝安全）。黄の位置 (20 + p) % 40 = 10 → p = 30
    const g = gameWith([[6, -1, -1, -1], [30, -1, -1, -1]], [4]);
    g.roll(0);
    g.move(0, 0);
    expect(g.state().players[1].pieces[0]).toBe(30);
  });

  test('ゴールへの道では蹴落としは起きない', () => {
    const g = gameWith([[38, -1, -1, -1], [-1, -1, -1, -1]], [2]);
    g.roll(0);
    g.move(0, 0);
    expect(g.state().players[0].pieces[0]).toBe(40);
  });
});

describe('抜けた人', () => {
  test('抜けた人のコマは盤から消え、手番は飛ばされる', () => {
    const g = gameWith([[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]], [3]);
    g.remove(1);
    g.roll(0);
    const s: LudoState = g.state();
    expect(s.players[1].removed).toBe(true);
    expect(s.current).toBe(2);
  });

  test('残りが1人になったら、その人の勝ちで終わる', () => {
    const g = new LudoGame(['a', 'b'], 0, dice(3));
    g.remove(0);
    const s = g.state();
    expect(s.ended).toBe(true);
    expect(s.winner).toBe(1);
  });
});

describe('順位', () => {
  test('勝った人が1位、ほかはゴールまでの近さ順', () => {
    const g = gameWith([[GOAL, GOAL, GOAL, 41], [30, 10, -1, -1], [38, 35, 2, -1]], [2]);
    g.roll(0);
    g.move(0, 3);
    expect(g.ranking().map((r) => r.seat)).toEqual([0, 2, 1]);
  });
});

describe('軽微な点', () => {
  test('自分の6でもう一度振れるときだけ bonus が立つ', () => {
    const g = new LudoGame(['a', 'b'], 0, dice(6, 6));
    g.roll(0);
    g.move(0, 0);
    expect(g.state().bonus).toBe(true);
    // 6でも動かせず手番が移ったら、次の人には立たない
    const h = gameWith([[53, GOAL, GOAL, GOAL], [-1, -1, -1, -1]], [6]);
    h.roll(0);
    expect(h.state().current).toBe(1);
    expect(h.state().bonus).toBe(false);
  });

  test('振るたびに rolls が1増える（手番が移る振りでも）', () => {
    const g = gameWith([[-1, -1, -1, -1], [-1, -1, -1, -1]], [3, 2]);
    expect(g.state().rolls).toBe(0);
    g.roll(0);
    g.roll(1);
    expect(g.state().rolls).toBe(2);
  });

  test('同じ点の人はすべて同じ順位', () => {
    const g = new LudoGame(['a', 'b', 'c', 'd'], 0, dice(3));
    g.remove(1);
    g.remove(2);
    g.remove(3);
    expect(g.ranking().map((r) => r.rank)).toEqual([1, 2, 2, 2]);
  });
});
