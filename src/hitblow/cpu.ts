import { createRng } from '../core/rng';
import type { Entry } from './match';
import type { HbMsg } from './protocol';
import { CODE_LENGTH, COLOR_COUNT, type Code, score } from './rules';
import { HbSession } from './session';

export type HbCpuLevel = 'weak' | 'normal' | 'strong';

// 1296 通りすべての並び
const ALL_CODES: Code[] = (() => {
  const out: Code[] = [];
  const total = COLOR_COUNT ** CODE_LENGTH;
  for (let n = 0; n < total; n++) {
    const code: Code = [];
    for (let i = 0, v = n; i < CODE_LENGTH; i++, v = Math.floor(v / COLOR_COUNT)) code.push(v % COLOR_COUNT);
    out.push(code);
  }
  return out;
})();

const consistent = (code: Code, entries: Entry[]) =>
  entries.every(({ guess, result }) => {
    const r = score(code, guess);
    return r.hit === result.hit && r.blow === result.blow;
  });

const pick = <T>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)];

// 候補の中から、結果ごとに分けたときの最大グループが一番小さくなる推測を選ぶ
function minimaxGuess(cands: Code[]): Code {
  let best = cands[0];
  let bestWorst = Infinity;
  for (const g of cands) {
    const buckets = new Map<number, number>();
    for (const c of cands) {
      const r = score(c, g);
      const k = r.hit * 10 + r.blow;
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    const worst = Math.max(...buckets.values());
    if (worst < bestWorst) {
      bestWorst = worst;
      best = g;
    }
  }
  return best;
}

export function chooseGuess(history: Entry[], level: HbCpuLevel, rng: () => number): Code {
  if (level === 'weak') {
    // 直前の結果とだけ矛盾しない並びから適当に選ぶ
    const last = history.slice(-1);
    return [...pick(ALL_CODES.filter((c) => consistent(c, last)), rng)];
  }
  const cands = ALL_CODES.filter((c) => consistent(c, history));
  if (cands.length === 0) return [...pick(ALL_CODES, rng)];
  if (level === 'normal') return [...pick(cands, rng)];
  // つよい: 最初の一手は定番の 0011、以降は候補を一番絞れる推測
  if (history.length === 0) return [0, 0, 1, 1];
  return [...minimaxGuess(cands)];
}

export type CpuHbOptions = { delayMs?: number; seed?: number };

// 後攻(1)の HbSession を CPU が操作する。人間側の HbSession とは HbMsg で直接やり取りする。
export class CpuHbPlayer {
  private session: HbSession;
  private rng: () => number;
  private delayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private level: HbCpuLevel,
    sendToHuman: (m: HbMsg) => void,
    options: CpuHbOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 900;
    this.rng = createRng(options.seed ?? Math.floor(Math.random() * 2 ** 31));
    // 相手の処理の途中に割り込まないよう、送受信は次のタイミングに回す
    this.session = new HbSession(1, (m) => setTimeout(() => !this.disposed && sendToHuman(m), 0));
    this.session.onChange = () => this.think();
    void this.session.setSecret(Array.from({ length: CODE_LENGTH }, () => Math.floor(this.rng() * COLOR_COUNT)));
  }

  receive(m: HbMsg): void {
    setTimeout(() => !this.disposed && void this.session.receive(m), 0);
  }

  private think(): void {
    if (this.disposed || this.timer !== null || !this.session.view().myTurn) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const v = this.session.view();
      if (!this.disposed && v.myTurn) this.session.guess(chooseGuess(v.myHistory, this.level, this.rng));
    }, this.delayMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
