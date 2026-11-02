import { decideLudo } from '../ludo/cpu';
import { Pacer, stateKey } from '../ludo/pacer';
import { LudoGame, type LudoState } from '../ludo/rules';
import { type LudoActions, button, renderLudo } from '../ludo/ui';
import { LudoOnline } from './ludo-online';
import type { GameContext, GameInstance, GameModule } from './types';

const ME = 0;
// CPU の1手ごとの間（動きが見えるように）
const CPU_STEP_MS = 650;
// 動かせるコマが1つだけのときに自動で動かすまでの間
const AUTO_MOVE_MS = 450;

function mount(ctx: GameContext): GameInstance {
  const app = document.createElement('div');
  app.className = 'ludo-app';
  ctx.root.replaceChildren(app);
  const mode = ctx.mode;
  const back = () => button('戻る', ctx.onBack);
  let disposed = false;
  // 描き直すたびに予約を取り消して決め直す。実行時に盤が変わっていれば何もしない
  const pacer = new Pacer();

  // 自分の番で、動かせるコマが1つだけなら自動で動かす
  const autoMove = (s: LudoState, mySeat: number, act: LudoActions, latest: () => LudoState | null) => {
    if (s.ended || s.current !== mySeat || s.phase !== 'move') return;
    const legal = LudoGame.restore(s, Math.random).legalMoves();
    if (legal.length !== 1) return;
    pacer.schedule(AUTO_MOVE_MS, stateKey(s), () => {
      const now = latest();
      return now ? stateKey(now) : '';
    }, () => act.move(legal[0]));
  };

  // ---- CPU 対戦（あなた＋CPU 3人） ----
  if (mode.kind !== 'online') {
    const level = mode.kind === 'cpu' ? mode.level : 'normal';
    const names = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];
    let game = new LudoGame(names, ME, Math.random);
    // 操作が通らなくても必ず描き直し、予約を決め直す
    const act: LudoActions = {
      roll: () => {
        game.roll(ME);
        render();
      },
      move: (piece) => {
        game.move(ME, piece);
        render();
      },
    };
    const again = () => {
      game = new LudoGame(names, ME, Math.random);
      render();
    };
    function render() {
      if (disposed) return;
      pacer.cancel();
      const s = game.state();
      renderLudo(app, s, ME, act, [button('もう一度', again), back()]);
      if (s.ended) return;
      if (s.current !== ME) {
        pacer.schedule(CPU_STEP_MS, stateKey(s), () => stateKey(game.state()), () => {
          const st = game.state();
          const a = decideLudo(st, level, Math.random);
          if (a.type === 'roll') game.roll(st.current);
          else game.move(st.current, a.piece);
          render();
        });
      } else {
        autoMove(s, ME, act, () => game.state());
      }
    }
    render();
    return {
      playerLeft: () => {},
      dispose() {
        disposed = true;
        pacer.cancel();
      },
    };
  }

  // ---- 卓での対戦 ----
  let stopped = false;
  let latest: LudoState | null = null;
  const act: LudoActions = { roll: () => online.roll(), move: (p) => online.move(p) };
  const online = new LudoOnline(mode.seat, mode.names, mode.link, (s) => {
    latest = s;
    if (disposed || stopped) return;
    pacer.cancel();
    renderLudo(app, s, mode.seat, act, [back()]);
    autoMove(s, mode.seat, act, () => latest);
  });
  online.onHostLeft = () => {
    stopped = true;
    pacer.cancel();
    const msg = document.createElement('div');
    msg.className = 'status';
    msg.textContent = `進行役の ${mode.names[0]} さんが抜けたため、終了しました`;
    app.replaceChildren(msg, back());
  };
  if (app.childElementCount === 0) {
    const wait = document.createElement('div');
    wait.className = 'status';
    wait.textContent = 'メンバーがそろうのを待っています…';
    app.replaceChildren(wait);
  }
  return {
    playerLeft: (seat) => {
      if (seat !== mode.seat && !stopped) online.playerLeft(seat);
    },
    dispose() {
      disposed = true;
      pacer.cancel();
      online.dispose();
    },
  };
}

export const ludoGame: GameModule = {
  id: 'ludo',
  title: 'ルドー',
  description: 'サイコロで4つのコマを1周させてゴールへ',
  hasPractice: false,
  mount,
};
