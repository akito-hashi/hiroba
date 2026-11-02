import type { LudoState } from './rules';

// 盤の状態を見分ける鍵。手番・目・段階・コマの位置が同じなら同じ
export function stateKey(s: LudoState): string {
  return `${s.current}:${s.dice}:${s.phase}:${s.ended}:${s.players.map((p) => p.pieces.join()).join('|')}`;
}

// CPU の一手や自動移動を少し間を置いて行うための予約。予約は常に1つだけで、
// 予約し直すと前の予約は取り消す。実行する瞬間の状態が予約したときと違えば何もしない。
export class Pacer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  schedule(ms: number, key: string, currentKey: () => string, fn: () => void): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (currentKey() === key) fn();
    }, ms);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
