import { type BbMsg, decodeBb } from '../src/baseball/protocol';

describe('baseball protocol', () => {
  test('正しい形のメッセージはそのまま通る', () => {
    const samples: BbMsg[] = [
      { t: 'pitch', n: 1, kind: 'curve' },
      { t: 'steer', n: 2, dir: -1 },
      { t: 'result', n: 3, result: 'homer', launch: { x: 12.5, y: -300 } },
      { t: 'result', n: 4, result: 'strike', launch: null },
    ];
    for (const msg of samples) {
      expect(decodeBb(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
    }
  });

  test.each([
    ['null', null],
    ['文字列', 'pitch'],
    ['投球番号が負', { t: 'pitch', n: -1, kind: 'straight' }],
    ['投球番号が小数', { t: 'pitch', n: 1.5, kind: 'straight' }],
    ['投球番号が文字列', { t: 'pitch', n: '1', kind: 'straight' }],
    ['球種が知らないもの', { t: 'pitch', n: 1, kind: 'fork' }],
    ['曲げの向きが範囲外', { t: 'steer', n: 1, dir: 2 }],
    ['結果が知らないもの', { t: 'result', n: 1, result: 'walk', launch: null }],
    ['打球が NaN', { t: 'result', n: 1, result: 'single', launch: { x: NaN, y: 1 } }],
    ['打球が範囲外', { t: 'result', n: 1, result: 'single', launch: { x: 1e9, y: 0 } }],
    ['打球が無い', { t: 'result', n: 1, result: 'single' }],
    ['知らない種類', { t: 'hack' }],
  ])('形が違うものは捨てる: %s', (_label, data) => {
    expect(decodeBb(data)).toBeNull();
  });

  test('余分な項目は落とす', () => {
    expect(decodeBb({ t: 'pitch', n: 1, kind: 'curve', evil: 1 })).toEqual({ t: 'pitch', n: 1, kind: 'curve' });
  });
});
