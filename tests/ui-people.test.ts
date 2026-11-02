import { avatarOf, playersText } from '../src/ui/people';

describe('avatarOf', () => {
  test('頭文字は名前の最初の1文字（絵文字も1文字として扱う）', () => {
    expect(avatarOf('id1', 'たろう').initial).toBe('た');
    expect(avatarOf('id1', 'abc').initial).toBe('A');
    expect(avatarOf('id1', '🐱ねこ').initial).toBe('🐱');
  });

  test('名前が空なら「?」', () => {
    expect(avatarOf('id1', '').initial).toBe('?');
  });

  test('色は参加者 ID から決まり、同じ ID なら同じ色', () => {
    const a = avatarOf('conn-123', 'たろう');
    expect(avatarOf('conn-123', '別の名前').hue).toBe(a.hue);
    expect(a.hue).toBeGreaterThanOrEqual(0);
    expect(a.hue).toBeLessThan(360);
  });

  test('ID が違えば、たいてい色も違う', () => {
    const hues = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => avatarOf(id, 'x').hue));
    expect(hues.size).toBeGreaterThanOrEqual(6);
  });
});

describe('playersText', () => {
  test('最少と最多が同じなら「2人」、違えば「2〜6人」', () => {
    expect(playersText({ min: 2, max: 2 })).toBe('2人');
    expect(playersText({ min: 2, max: 6 })).toBe('2〜6人');
  });
});
