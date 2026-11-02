import { type Action, Game } from '../core/game';
import { pieceCells } from '../core/piece';
import { Score } from '../core/score';
import { CpuController } from '../cpu/controller';
import type { CpuLevel } from '../cpu/cpu';
import type { NetMsg } from '../net/protocol';
import { attachKeyboard } from './input';
import { Effects } from './effects';
import type { BoardView } from './render';

// 画面に出すメッセージ枠を操作する関数（main.ts から渡す）
export type Ui = {
  showMenu(): void;
  showMessage(text: string, buttons?: { label: string; onClick: () => void }[], copyUrl?: string): void;
  hideOverlay(): void;
};

export interface Session {
  update(dtMs: number): void;
  views(): BoardView[];
  dispose(): void;
}

const ROUND_BREAK_MS = 2000;
// ネット対戦で「同時に負けた」とみなす時間差
const DRAW_WINDOW_MS = 800;
const SNAPSHOT_INTERVAL_MS = 100;

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function viewOf(game: Game, label: string, wins: number, effects?: Effects): BoardView {
  return {
    effects: effects?.active(performance.now()) ?? [],
    cells: game.board.toArray(),
    piece: game.status === 'playing' ? { cells: pieceCells(game.current), colors: game.current.colors } : null,
    next: game.next,
    pending: game.garbage.pendingTotal(),
    label,
    wins,
  };
}

// ---- ひとりで練習 ----
export class SoloSession implements Session {
  private game = new Game(randomSeed());
  private effects = new Effects();
  private detach: () => void;

  constructor(private ui: Ui) {
    this.detach = attachKeyboard((a) => this.game.input(a));
    ui.hideOverlay();
  }

  update(dt: number) {
    this.game.tick(dt);
    const events = this.game.drainEvents();
    for (const e of events) if (e.type === 'cleared') this.effects.add(e.result, performance.now());
    if (events.some((e) => e.type === 'lost')) {
      this.ui.showMessage('ゲームオーバー', [
        { label: 'もう一度', onClick: () => this.restart() },
        { label: 'メニューへ', onClick: () => this.ui.showMenu() },
      ]);
    }
  }

  private restart() {
    this.game = new Game(randomSeed());
    this.effects = new Effects();
    this.ui.hideOverlay();
  }

  views() {
    return [viewOf(this.game, 'あなた', 0, this.effects)];
  }

  dispose() {
    this.detach();
  }
}

// ---- CPU 対戦 ----
export class CpuSession implements Session {
  private score = new Score();
  private player!: Game;
  private cpu!: Game;
  private controller!: CpuController;
  private playerFx = new Effects();
  private cpuFx = new Effects();
  private roundActive = false;
  private detach: () => void;
  private timeouts: number[] = [];

  constructor(
    private ui: Ui,
    private level: CpuLevel,
  ) {
    this.detach = attachKeyboard((a) => this.roundActive && this.player.input(a));
    this.startRound();
  }

  private startRound() {
    const seed = randomSeed();
    // 同じシードで同じピース列にして公平にする
    this.player = new Game(seed);
    this.cpu = new Game(seed);
    this.controller = new CpuController(this.cpu, this.level, seed);
    // 前のラウンドの演出が新しい盤面に重ならないようにする
    this.playerFx = new Effects();
    this.cpuFx = new Effects();
    this.roundActive = true;
    this.ui.hideOverlay();
  }

  update(dt: number) {
    if (!this.roundActive) return;
    this.player.tick(dt);
    this.controller.tick(dt);
    this.cpu.tick(dt);
    const now = performance.now();
    for (const e of this.player.drainEvents()) {
      if (e.type === 'attack') this.cpu.receiveAttack(e.chunks);
      if (e.type === 'cleared') this.playerFx.add(e.result, now);
    }
    for (const e of this.cpu.drainEvents()) {
      if (e.type === 'attack') this.player.receiveAttack(e.chunks);
      if (e.type === 'cleared') this.cpuFx.add(e.result, now);
    }

    const pLost = this.player.status === 'lost';
    const cLost = this.cpu.status === 'lost';
    if (!pLost && !cLost) return;
    this.roundActive = false;
    this.score.record(pLost && cLost ? 'draw' : pLost ? 1 : 0);
    endRound(this.ui, this.score, pLost && cLost ? 'draw' : pLost ? 1 : 0, 0, {
      next: () => this.timeouts.push(window.setTimeout(() => this.startRound(), ROUND_BREAK_MS)),
      rematch: () => {
        this.score = new Score();
        this.startRound();
      },
    });
  }

  views() {
    return [
      viewOf(this.player, 'あなた', this.score.wins[0], this.playerFx),
      viewOf(this.cpu, 'CPU', this.score.wins[1], this.cpuFx),
    ];
  }

  dispose() {
    this.detach();
    this.timeouts.forEach(clearTimeout);
  }
}

// ラウンド終了時の表示。me はこちら側のプレイヤー番号。
function endRound(
  ui: Ui,
  score: Score,
  roundWinner: 0 | 1 | 'draw',
  me: 0 | 1,
  on: { next: () => void; rematch: () => void },
) {
  const matchWinner = score.winner();
  if (matchWinner !== null) {
    ui.showMessage(matchWinner === me ? '🎉 あなたの勝ち！' : '負けてしまった…', [
      { label: '再戦', onClick: on.rematch },
      { label: 'メニューへ', onClick: () => ui.showMenu() },
    ]);
    return;
  }
  const text = roundWinner === 'draw' ? '引き分け（やり直し）' : roundWinner === me ? 'このラウンドの勝ち！' : 'このラウンドは負け';
  ui.showMessage(`${text}\n${score.wins[me]} - ${score.wins[me === 0 ? 1 : 0]}`);
  on.next();
}

// ---- ネット対戦 ----
// ホスト(0)がラウンドの開始と勝敗を決め、ゲスト(1)はそれに従う。
export class OnlineSession implements Session {
  private score = new Score();
  private game: Game | null = null;
  private remote: BoardView | null = null;
  private effects = new Effects();
  private roundActive = false;
  private snapshotTimer = 0;
  private lostAt: [number | null, number | null] = [null, null];
  private rematchReady: [boolean, boolean] = [false, false];
  private detachKeys: () => void;
  private timeouts: number[] = [];
  private disposed = false;
  private closed = false;

  // 通信は広場の卓が持つ。ここでは送る関数だけ受け取り、届いたものは onMessage に渡してもらう。
  constructor(
    private ui: Ui,
    private me: 0 | 1,
    private send: (m: NetMsg) => void,
  ) {
    this.detachKeys = attachKeyboard((a: Action) => this.roundActive && this.game?.input(a));
    if (me === 0) this.startRoundAsHost();
    else ui.showMessage('開始を待っています…');
  }

  private startRoundAsHost() {
    const seed = randomSeed();
    this.send({ t: 'start', seed });
    this.beginRound(seed);
  }

  private beginRound(seed: number) {
    if (this.closed) return;
    this.game = new Game(seed);
    this.effects = new Effects();
    this.remote = null;
    this.lostAt = [null, null];
    this.roundActive = true;
    this.ui.hideOverlay();
  }

  onMessage(m: NetMsg) {
    switch (m.t) {
      case 'start':
        if (this.me === 1) {
          if (this.score.winner() !== null) this.score = new Score();
          this.rematchReady = [false, false];
          this.beginRound(m.seed);
        }
        break;
      case 'snapshot':
        this.remote = { cells: m.cells, piece: m.piece, next: m.next, pending: m.pending, label: '相手', wins: 0, effects: [] };
        break;
      case 'attack':
        if (this.roundActive) this.game?.receiveAttack(m.chunks);
        break;
      case 'lost':
        if (this.me === 0) this.onLoss(1);
        break;
      case 'roundEnd':
        if (this.me === 1) this.finishRound(m.winner);
        break;
      case 'rematch':
        this.rematchReady[this.me === 0 ? 1 : 0] = true;
        this.maybeRematch();
        break;
    }
  }

  // ホストだけが呼ぶ。最初の負けから少し待って、同時負けなら引き分け。
  private onLoss(who: 0 | 1) {
    if (this.lostAt[who] !== null) return;
    this.lostAt[who] = performance.now();
    const other = who === 0 ? 1 : 0;
    if (this.lostAt[other] !== null) return; // 先に負けた側のタイマーで判定する
    this.timeouts.push(
      window.setTimeout(() => {
        const both = this.lostAt[0] !== null && this.lostAt[1] !== null;
        const winner = both ? 'draw' : other;
        this.send({ t: 'roundEnd', winner });
        this.finishRound(winner);
      }, DRAW_WINDOW_MS),
    );
  }

  private finishRound(winner: 0 | 1 | 'draw') {
    if (this.closed) return;
    this.roundActive = false;
    this.score.record(winner);
    endRound(this.ui, this.score, winner, this.me, {
      next: () => {
        if (this.me === 0) this.timeouts.push(window.setTimeout(() => this.startRoundAsHost(), ROUND_BREAK_MS));
      },
      rematch: () => {
        this.rematchReady[this.me] = true;
        this.send({ t: 'rematch' });
        this.ui.showMessage('相手の再戦を待っています…', [{ label: 'メニューへ', onClick: () => this.ui.showMenu() }]);
        this.maybeRematch();
      },
    });
  }

  private maybeRematch() {
    if (this.me !== 0 || !this.rematchReady[0] || !this.rematchReady[1]) return;
    this.rematchReady = [false, false];
    this.score = new Score();
    this.startRoundAsHost();
  }

  opponentLeft() {
    if (this.disposed) return;
    // 次ラウンド開始や勝敗判定のタイマーが、切断メッセージを上書きしないよう止める
    this.closed = true;
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
    this.roundActive = false;
    this.ui.showMessage('相手が抜けました', [{ label: '戻る', onClick: () => this.ui.showMenu() }]);
  }

  update(dt: number) {
    const g = this.game;
    if (!g || !this.roundActive) return;
    g.tick(dt);
    for (const e of g.drainEvents()) {
      if (e.type === 'attack') this.send({ t: 'attack', chunks: e.chunks });
      if (e.type === 'cleared') this.effects.add(e.result, performance.now());
      if (e.type === 'lost') {
        if (this.me === 0) this.onLoss(0);
        else this.send({ t: 'lost' });
      }
    }
    this.snapshotTimer += dt;
    if (this.snapshotTimer >= SNAPSHOT_INTERVAL_MS) {
      this.snapshotTimer = 0;
      const v = viewOf(g, '', 0);
      this.send({ t: 'snapshot', cells: v.cells, piece: v.piece, next: v.next, pending: v.pending });
    }
  }

  views() {
    const other = this.me === 0 ? 1 : 0;
    const mine = this.game ? [viewOf(this.game, 'あなた', this.score.wins[this.me], this.effects)] : [];
    return this.remote ? [...mine, { ...this.remote, wins: this.score.wins[other] }] : mine;
  }

  dispose() {
    this.disposed = true;
    this.detachKeys();
    this.timeouts.forEach(clearTimeout);
  }
}
