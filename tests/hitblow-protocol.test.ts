import { type HbMsg, decodeHb } from '../src/hitblow/protocol';

const hash = 'a'.repeat(64);

describe('hitblow protocol', () => {
  const samples: HbMsg[] = [
    { t: 'ready', commitment: hash },
    { t: 'guess', code: [0, 5, 5, 2] },
    { t: 'result', hit: 2, blow: 1 },
    { t: 'result', hit: 4, blow: 0 },
    { t: 'reveal', secret: [1, 1, 1, 1], salt: 'f'.repeat(32) },
  ];

  test.each(samples)('送って受け取ったら中身が変わらない: $t', (msg) => {
    expect(decodeHb(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
  });

  test.each([
    ['null', null],
    ['文字列', 'guess'],
    ['知らない種類', { t: 'hack' }],
    ['ping は扱わない', { t: 'ping' }],
    ['封印値が短い', { t: 'ready', commitment: 'abc' }],
    ['封印値が16進でない', { t: 'ready', commitment: 'z'.repeat(64) }],
    ['推測が範囲外', { t: 'guess', code: [0, 1, 2, 6] }],
    ['推測の長さ違い', { t: 'guess', code: [0, 1] }],
    ['結果が負', { t: 'result', hit: -1, blow: 0 }],
    ['結果の合計が4超え', { t: 'result', hit: 3, blow: 2 }],
    ['3ヒット1ブローはありえない', { t: 'result', hit: 3, blow: 1 }],
    ['結果が小数', { t: 'result', hit: 1.5, blow: 0 }],
    ['公開した塩が文字列でない', { t: 'reveal', secret: [0, 0, 0, 0], salt: 5 }],
    ['塩が長すぎる', { t: 'reveal', secret: [0, 0, 0, 0], salt: 'a'.repeat(1000) }],
  ])('壊れたデータは null: %s', (_, data) => {
    expect(decodeHb(data)).toBeNull();
  });

  test('余計なプロパティは捨てる', () => {
    expect(decodeHb({ t: 'result', hit: 1, blow: 1, extra: 'x' })).toEqual({ t: 'result', hit: 1, blow: 1 });
  });
});
