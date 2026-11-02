import { commit, randomSalt, verifyReveal } from './commit';
import { type Entry, HitBlowMatch, type Outcome, type Player } from './match';
import type { HbMsg } from './protocol';
import { type Code, isValidCode, score } from './rules';

export type Phase = 'setup' | 'waiting' | 'playing' | 'revealing' | 'ended';

export type HbView = {
  phase: Phase;
  myTurn: boolean;
  waitingResult: boolean;
  myHistory: Entry[];
  // 相手の推測と、こちらが返した判定（自分の正解に対するもの）
  oppHistory: Entry[];
  oppTurns: number;
  outcome: Outcome | null;
  mySecret: Code | null;
  // 相手の正解は、決着して公開されるまで分からない
  oppSecret: Code | null;
  disconnected: boolean;
};

// 1人分の対戦の進行。画面と通信からは切り離してある。
// 正解は自分のブラウザだけが持ち、相手の推測はこちらで判定して返す。
export class HbSession {
  onChange: () => void = () => {};
  private match = new HitBlowMatch();
  private opp: Player;
  private secret: Code | null = null;
  private salt = randomSalt();
  private oppCommitment: string | null = null;
  private oppReveal: { secret: Code; salt: string } | null = null;
  private oppSecret: Code | null = null;
  private pendingGuess: Code | null = null;
  private phase: Phase = 'setup';
  private disconnectedFlag = false;

  constructor(
    readonly me: Player,
    private send: (m: HbMsg) => void,
  ) {
    this.opp = me === 0 ? 1 : 0;
  }

  view(): HbView {
    return {
      phase: this.phase,
      myTurn: this.phase === 'playing' && this.match.turnOf() === this.me && !this.pendingGuess,
      waitingResult: this.pendingGuess !== null,
      myHistory: this.match.history(this.me),
      oppHistory: this.match.history(this.opp),
      oppTurns: this.match.turns()[this.opp],
      outcome: this.match.outcome(),
      mySecret: this.secret,
      oppSecret: this.oppSecret,
      disconnected: this.disconnectedFlag,
    };
  }

  async setSecret(code: Code): Promise<boolean> {
    if (this.phase !== 'setup' || !isValidCode(code)) return false;
    // 封印値を作れてから状態を進める（https でない環境では暗号機能が使えない）
    let commitment: string;
    try {
      commitment = await commit(code, this.salt);
    } catch {
      return false;
    }
    if (this.phase !== 'setup') return false;
    this.secret = [...code];
    this.phase = 'waiting';
    this.send({ t: 'ready', commitment });
    this.maybeStart();
    this.onChange();
    return true;
  }

  guess(code: Code): boolean {
    if (!this.view().myTurn || !isValidCode(code)) return false;
    this.pendingGuess = [...code];
    this.send({ t: 'guess', code: this.pendingGuess });
    this.onChange();
    return true;
  }

  async receive(m: HbMsg): Promise<void> {
    switch (m.t) {
      case 'ready':
        if (this.oppCommitment !== null) return;
        this.oppCommitment = m.commitment;
        this.maybeStart();
        break;
      case 'guess': {
        if (this.phase !== 'playing' || this.match.turnOf() !== this.opp || !this.secret) return;
        const result = score(this.secret, m.code);
        this.send({ t: 'result', ...result });
        this.match.record(this.opp, m.code, result);
        this.afterRecord();
        break;
      }
      case 'result':
        if (!this.pendingGuess) return;
        this.match.record(this.me, this.pendingGuess, { hit: m.hit, blow: m.blow });
        this.pendingGuess = null;
        this.afterRecord();
        break;
      case 'reveal':
        if (this.oppReveal) return;
        this.oppReveal = { secret: m.secret, salt: m.salt };
        await this.maybeFinish();
        break;
    }
    this.onChange();
  }

  disconnected() {
    this.disconnectedFlag = true;
    this.giveUpOnOpponent('disconnect');
  }

  // 相手の返事（判定・正解の公開）を待ちすぎたときに画面から呼ぶ
  opponentStalled() {
    if (this.phase === 'playing' && !this.pendingGuess) return; // 待たせているのは自分
    this.giveUpOnOpponent('stalled');
  }

  private giveUpOnOpponent(reason: 'disconnect' | 'stalled') {
    if (this.phase === 'ended') return;
    if (this.phase === 'revealing') {
      // 公開された正解を照合中なら、その結果を待つ
      if (this.oppReveal) return;
      // 正解を公開しないまま去った相手の判定は信用できない
      this.match.cheated(this.opp);
    } else if (this.phase === 'playing') {
      this.match.forfeit(this.opp, reason);
    }
    this.phase = 'ended';
    this.onChange();
  }

  private maybeStart() {
    if (this.phase === 'waiting' && this.oppCommitment !== null) this.phase = 'playing';
  }

  private afterRecord() {
    if (!this.match.outcome() || this.phase !== 'playing') return;
    this.phase = 'revealing';
    this.send({ t: 'reveal', secret: this.secret!, salt: this.salt });
    void this.maybeFinish().then(() => this.onChange());
  }

  private async maybeFinish() {
    if (this.phase !== 'revealing' || !this.oppReveal) return;
    const { secret, salt } = this.oppReveal;
    const honest = await verifyReveal(this.oppCommitment!, secret, salt, this.match.history(this.me));
    if (this.phase !== 'revealing') return;
    if (!honest) this.match.cheated(this.opp);
    this.oppSecret = secret;
    this.phase = 'ended';
  }
}
