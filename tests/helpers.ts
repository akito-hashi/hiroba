import { BALL_COLORS, type Board } from '../src/core/board';
import { rowWidth } from '../src/core/grid';

// 隣り合う同色が1つもできない塗り方で、段 from〜to-1 を埋める（消えない詰め物）
export function fillNoMatch(b: Board, from: number, to: number) {
  for (let r = from; r < to; r++) {
    for (let c = 0; c < rowWidth(r); c++) b.set({ c, r }, BALL_COLORS[(c + 2 * r) % BALL_COLORS.length]);
  }
}
