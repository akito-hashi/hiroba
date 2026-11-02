import { MAX_MEMBERS, NAME_MAX, Plaza } from '../src/plaza/state';

const HOST = 'h';

function plazaWith(...names: string[]) {
  const p = new Plaza(HOST, 'ホスト');
  names.forEach((n, i) => p.join(`m${i + 1}`, n));
  return p;
}

describe('参加と退出', () => {
  test('名前を整え、同じ名前には番号を付ける', () => {
    const p = new Plaza(HOST, 'たろう');
    expect(p.join('a', '  たろう  ')).toEqual({ ok: true });
    expect(p.join('b', 'あいうえおかきくけこさしすせそ')).toEqual({ ok: true });
    expect(p.state().members.map((m) => m.name)).toEqual(['たろう', 'たろう(2)', 'あいうえおかきくけこさし']);
  });

  test('番号を付けても名前の上限を超えない', () => {
    const p = new Plaza(HOST, 'あいうえおかきくけこさし');
    p.join('a', 'あいうえおかきくけこさし');
    const name = p.state().members[1].name;
    expect([...name].length).toBeLessThanOrEqual(NAME_MAX);
    expect(name.endsWith('(2)')).toBe(true);
  });

  test('空白だけの名前は断る', () => {
    expect(new Plaza(HOST, 'h').join('a', '   ')).toEqual({ ok: false, reason: 'name' });
  });

  test(`${MAX_MEMBERS + 1}人目は満員で断る`, () => {
    const p = new Plaza(HOST, 'h');
    for (let i = 1; i < MAX_MEMBERS; i++) expect(p.join(`m${i}`, `p${i}`).ok).toBe(true);
    expect(p.join('over', 'over')).toEqual({ ok: false, reason: 'full' });
  });

  test('同じ人が2回参加しても1人のまま', () => {
    const p = plazaWith('a');
    expect(p.join('m1', 'a')).toEqual({ ok: false, reason: 'dup' });
    expect(p.state().members).toHaveLength(2);
  });

  test('切断した人は広場からも卓からも消える', () => {
    const p = plazaWith('a', 'b');
    const t = p.createTable('m1', 'yacht')!;
    p.joinTable('m2', t);
    p.leave('m1');
    expect(p.state().members.map((m) => m.id)).toEqual([HOST, 'm2']);
    expect(p.table(t)?.seats).toEqual(['m2']);
  });
});

describe('卓', () => {
  test('作った人が席0（卓の主）になる', () => {
    const p = plazaWith('a');
    const t = p.createTable('m1', 'six')!;
    expect(p.table(t)).toMatchObject({ game: 'six', seats: ['m1'], status: 'waiting', round: 0 });
  });

  test('1人が入れる卓は1つだけ', () => {
    const p = plazaWith('a', 'b');
    const t1 = p.createTable('m1', 'six')!;
    p.createTable('m2', 'yacht');
    expect(p.createTable('m1', 'hb')).toBeNull();
    expect(p.joinTable('m1', p.state().tables[1].id)).toBe(false);
    expect(p.table(t1)?.seats).toEqual(['m1']);
  });

  test('トイベースボールの卓は2人で始められ、3人目は座れない', () => {
    const p = plazaWith('a', 'b');
    const t = p.createTable(HOST, 'baseball')!;
    expect(p.joinTable('m1', t)).toBe(true);
    expect(p.joinTable('m2', t)).toBe(false);
    expect(p.start(HOST)).toBe(true);
  });

  test('定員を超えて入れない', () => {
    const p = plazaWith('a', 'b');
    const t = p.createTable(HOST, 'six')!;
    expect(p.joinTable('m1', t)).toBe(true);
    expect(p.joinTable('m2', t)).toBe(false);
  });

  test('卓の主だけが、最低人数がそろったときに開始できる', () => {
    const p = plazaWith('a', 'b');
    const t = p.createTable('m1', 'yacht')!;
    expect(p.start('m1')).toBe(false); // 1人では始められない
    p.joinTable('m2', t);
    expect(p.start('m2')).toBe(false); // 主ではない
    expect(p.start('m1')).toBe(true);
    expect(p.table(t)).toMatchObject({ status: 'playing', round: 1, players: ['m1', 'm2'] });
  });

  test('開始後の卓には入れず、出ることもできない', () => {
    const p = plazaWith('a', 'b', 'c');
    const t = p.createTable('m1', 'yacht')!;
    p.joinTable('m2', t);
    p.start('m1');
    expect(p.joinTable('m3', t)).toBe(false);
    expect(p.leaveTable('m2')).toBe(false);
  });

  test('ゲームから戻った人は players が null になり、全員戻ると募集中に戻る', () => {
    const p = plazaWith('a', 'b');
    const t = p.createTable('m1', 'six')!;
    p.joinTable('m2', t);
    p.start('m1');
    expect(p.leftGame('m2', t, 1)).toBe(true);
    expect(p.table(t)).toMatchObject({ status: 'playing', players: ['m1', null] });
    expect(p.leftGame('m2', t, 1)).toBe(false); // 2回目は何もしない
    expect(p.leftGame('m1', t, 0)).toBe(false); // 古い開始回数は無視
    p.leftGame('m1', t, 1);
    expect(p.table(t)).toMatchObject({ status: 'waiting', players: [] });
    expect(p.start('m1')).toBe(true);
    expect(p.table(t)?.round).toBe(2);
  });

  test('遊んでいる最中に切断した人は players が null になる', () => {
    const p = plazaWith('a', 'b', 'c');
    const t = p.createTable('m1', 'yacht')!;
    p.joinTable('m2', t);
    p.joinTable('m3', t);
    p.start('m1');
    p.leave('m2');
    expect(p.table(t)).toMatchObject({ status: 'playing', players: ['m1', null, 'm3'], seats: ['m1', 'm3'] });
  });

  test('卓の主が出ると次の人が主になり、全員出ると卓が消える', () => {
    const p = plazaWith('a', 'b');
    const t = p.createTable('m1', 'yacht')!;
    p.joinTable('m2', t);
    expect(p.leaveTable('m1')).toBe(true);
    expect(p.table(t)?.seats).toEqual(['m2']);
    p.leaveTable('m2');
    expect(p.table(t)).toBeUndefined();
  });

  test('卓の番号は消えても使い回さない', () => {
    const p = plazaWith('a');
    const t1 = p.createTable('m1', 'six')!;
    p.leaveTable('m1');
    expect(p.createTable('m1', 'six')).not.toBe(t1);
  });

  test('いない人は何もできない', () => {
    const p = new Plaza(HOST, 'h');
    expect(p.createTable('ghost', 'six')).toBeNull();
  });
});
