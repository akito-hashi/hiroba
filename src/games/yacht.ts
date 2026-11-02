import { decideCpu } from '../yacht/cpu';
import { YachtGame, type YachtState } from '../yacht/game';
import type { Category } from '../yacht/rules';
import { button, diceArea, el, results, scoreTable } from '../yacht/ui';
import type { GameContext, GameInstance, GameModule } from './types';
import { YachtOnline } from './yacht-online';

const ME = 0;
const CPU = 1;
// CPU の1手ごとの間（動きが見えるように）
const CPU_STEP_MS = 700;
// 盤面（サイコロと点数表）と、決着時の結果を描く共通部分
function drawBoard(
  app: HTMLElement,
  s: YachtState,
  mySeat: number,
  act: { hold(i: number): void; roll(): void; score(c: Category): void },
  endButtons: HTMLElement[],
  playButtons: HTMLElement[],
  ranking: () => Parameters<typeof results>[0],
) {
  const myTurn = !s.ended && s.current === mySeat;
  const left = el('div', 'side');
  if (s.ended) left.append(results(ranking()), ...endButtons);
  else left.append(diceArea({ state: s, canAct: myTurn, onHold: act.hold, onRoll: act.roll }), ...playButtons);
  const board = el('div', 'board');
  board.append(left, scoreTable({ state: s, mySeat, onScore: act.score }));
  app.replaceChildren(board);
}

function mount(ctx: GameContext): GameInstance {
  const app = el('div', 'yacht-app');
  app.id = 'app';
  ctx.root.replaceChildren(app);
  const mode = ctx.mode;
  const back = () => button('戻る', ctx.onBack);
  let disposed = false;

  // ---- CPU 対戦 ----
  if (mode.kind !== 'online') {
    const level = mode.kind === 'cpu' ? mode.level : 'normal';
    let first = ME;
    let game = new YachtGame(['あなた', 'CPU'], first, Math.random);
    let cpuTimer: number | null = null;

    const act = (f: (g: YachtGame) => boolean) => {
      if (f(game)) render();
    };
    // CPU の番なら、1手ずつ間を置いて進める
    const scheduleCpu = () => {
      const s = game.state();
      if (disposed || cpuTimer !== null || s.ended || s.current !== CPU) return;
      cpuTimer = window.setTimeout(() => {
        cpuTimer = null;
        const st = game.state();
        const a = decideCpu(st, CPU, level, Math.random);
        if (a.type === 'roll') game.roll(CPU);
        else if (a.type === 'score') game.score(CPU, a.category);
        else a.held.forEach((h, i) => h !== st.held[i] && game.toggleHold(CPU, i));
        render();
      }, CPU_STEP_MS);
    };
    const again = () => {
      if (cpuTimer !== null) clearTimeout(cpuTimer);
      cpuTimer = null;
      first = first === ME ? CPU : ME;
      game = new YachtGame(['あなた', 'CPU'], first, Math.random);
      render();
    };
    function render() {
      if (disposed) return;
      drawBoard(
        app,
        game.state(),
        ME,
        {
          hold: (i) => act((g) => g.toggleHold(ME, i)),
          roll: () => act((g) => g.roll(ME)),
          score: (c) => act((g) => g.score(ME, c)),
        },
        [button('もう一度', again), back()],
        [],
        () => game.ranking(),
      );
      scheduleCpu();
    }
    render();
    return {
      playerLeft: () => {},
      dispose() {
        disposed = true;
        if (cpuTimer !== null) clearTimeout(cpuTimer);
      },
    };
  }

  // ---- 卓での対戦 ----
  // 進行は YachtOnline（卓の席0が管理）。もう一度遊ぶときは、卓の画面から卓の主が開始し直す。
  let stopped = false;
  const stop = (text: string) => {
    stopped = true;
    app.replaceChildren(el('div', 'status', text), back());
  };
  const online = new YachtOnline(mode.seat, mode.names, mode.link, (state, mySeat) => {
    if (disposed || stopped) return;
    if (!state) return;
    drawBoard(
      app,
      state,
      mySeat,
      {
        hold: (i) => online.hold(i),
        roll: () => online.roll(),
        score: (c) => online.score(c),
      },
      [back()],
      [],
      () => YachtGame.restore(state, Math.random).ranking(),
    );
  });
  online.onHostLeft = () => stop(`進行役の ${mode.names[0]} さんが抜けたため、終了しました`);
  if (!stopped && app.childElementCount === 0) app.replaceChildren(el('div', 'status', 'メンバーがそろうのを待っています…'));
  return {
    playerLeft: (seat) => {
      if (seat === mode.seat || stopped) return;
      online.playerLeft(seat);
      if (online.cancelled) stop('始まる前にメンバーが抜けたため、始められませんでした');
    },
    dispose() {
      disposed = true;
      online.dispose();
    },
  };
}

export const yachtGame: GameModule = {
  id: 'yacht',
  title: 'ヨット',
  description: 'サイコロ5個で役を作って点数を競う',
  hasPractice: false,
  mount,
};
