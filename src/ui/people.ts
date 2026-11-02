// 参加者の丸いアイコンと、人数の表し方。画面からは切り離してある。

export type Avatar = { initial: string; hue: number };

// FNV-1a。ID から色相を決めるのに使う（同じ ID なら毎回同じ色）
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// 頭文字は名前の最初の1文字（絵文字も1文字）。色は名前ではなく ID から決め、
// 同じ名前の人がいても見分けられるようにする
export function avatarOf(id: string, name: string): Avatar {
  const first = [...name.trim()][0];
  return { initial: first ? first.toUpperCase() : '?', hue: hash(id) % 360 };
}

export function playersText({ min, max }: { min: number; max: number }): string {
  return min === max ? `${min}人` : `${min}〜${max}人`;
}
