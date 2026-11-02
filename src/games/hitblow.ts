import { CpuHbPlayer } from '../hitblow/cpu';
import type { Outcome, Player } from '../hitblow/match';
import { type HbMsg, decodeHb } from '../hitblow/protocol';
import { CODE_LENGTH, COLOR_COUNT, type Code, MAX_TURNS } from '../hitblow/rules';
import { HbSession } from '../hitblow/session';
import { type GameContext, type GameInstance, type GameModule, pairLink } from './types';

// 相手の判定・正解の公開をこれ以上待たされたら、相手の負けにする
const STALL_LIMIT_MS = 90_000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void, disabled = false) {
  const b = el('button', '', label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function ballsRow(code: Code, className = 'row') {
  const row = el('div', className);
  for (const c of code) row.append(el('span', `ball c${c}`));
  return row;
}

function historyList(entries: { guess: Code; result: { hit: number; blow: number } }[]) {
  const list = el('div', 'history');
  if (entries.length === 0) list.append(el('div', 'sub empty-history', 'まだありません'));
  entries.forEach((e, i) => {
    const row = el('div', 'row');
    // 結果はピンで見せる: ヒットはピンク、ブローは白、外れは空き
    const pegs = el('span', 'pegs');
    pegs.title = `${e.result.hit}ヒット ${e.result.blow}ブロー`;
    for (let k = 0; k < CODE_LENGTH; k++) {
      pegs.append(el('span', k < e.result.hit ? 'peg hit' : k < e.result.hit + e.result.blow ? 'peg blow' : 'peg'));
    }
    const score = el('span', 'score');
    score.append(pegs, el('span', 'score-text', `${e.result.hit}H ${e.result.blow}B`));
    row.append(el('span', 'n', `${i + 1}`), ballsRow(e.guess), score);
    list.append(row);
  });
  return list;
}

function outcomeText(o: Outcome, me: Player, vsCpu: boolean) {
  const opp = vsCpu ? 'CPU' : '相手';
  if (o.reason === 'cheat')
    return o.winner === me ? `${opp}の判定に不正があったか、正解が公開されませんでした。あなたの勝ち！` : '判定の不正が見つかりました。あなたの負け';
  if (o.reason === 'disconnect') return `${opp}が切断しました。あなたの勝ち！`;
  if (o.reason === 'stalled') return `${opp}から応答がありません。あなたの勝ち！`;
  if (o.winner === 'draw') return o.reason === 'turns' ? `${MAX_TURNS}ターンで決着せず、引き分け` : '同じターンで当て合って、引き分け';
  return o.winner === me ? 'あなたの勝ち！' : 'あなたの負け…';
}

function mount(ctx: GameContext): GameInstance {
  const app = el('div', 'hb-app');
  app.id = 'app';
  ctx.root.replaceChildren(app);
  const mode = ctx.mode;
  const vsCpu = mode.kind !== 'online';
  const opp = vsCpu ? 'CPU' : '相手';

  let session!: HbSession;
  let cpu: CpuHbPlayer | null = null;
  let offMessage = () => {};
  // 入力中の色の並び（正解の設定と推測で使い回す）
  let draft: Code = [];
  let stallTimer: number | null = null;
  let disposed = false;

  function start() {
    cpu?.dispose();
    draft = [];
    if (mode.kind === 'online') {
      const link = pairLink(mode.link, mode.seat);
      session = new HbSession(mode.seat === 0 ? 0 : 1, (m) => link.send(m));
    } else {
      const level = mode.kind === 'cpu' ? mode.level : 'normal';
      cpu = new CpuHbPlayer(level, (m) => void session.receive(m));
      session = new HbSession(0, (m) => cpu?.receive(m));
    }
    session.onChange = render;
    render();
  }

  // 相手の返事を待っている間だけタイマーを動かす
  function watchStall(waiting: boolean) {
    if (!waiting) {
      if (stallTimer !== null) clearTimeout(stallTimer);
      stallTimer = null;
    } else if (stallTimer === null) {
      stallTimer = window.setTimeout(() => {
        stallTimer = null;
        session.opponentStalled();
      }, STALL_LIMIT_MS);
    }
  }

  function showMessage(text: string, extra: Node[] = []) {
    app.replaceChildren(el('div', 'status', text), ...extra);
  }

  // 6色のボタンで4つ並べる。並んだ玉を押すとその玉を外す。
  function composer(label: string, enabled: boolean, onSubmit: (code: Code) => void) {
    const box = el('div');
    box.style.display = 'contents';
    const slots = el('div', 'row slots');
    for (let i = 0; i < CODE_LENGTH; i++) {
      const c = draft[i];
      const b = button('', () => {
        draft.splice(i, 1);
        render();
      }, !enabled || c === undefined);
      b.className = c === undefined ? 'ball empty' : `ball c${c}`;
      b.setAttribute('aria-label', c === undefined ? '空き' : `${i + 1}番目を外す`);
      slots.append(b);
    }
    const palette = el('div', 'row');
    for (let c = 0; c < COLOR_COUNT; c++) {
      const b = button('', () => {
        draft.push(c);
        render();
      }, !enabled || draft.length >= CODE_LENGTH);
      b.className = `ball c${c}`;
      b.setAttribute('aria-label', `色${c + 1}`);
      palette.append(b);
    }
    const submit = button(label, () => {
      const code = draft;
      draft = [];
      onSubmit(code);
      render();
    }, !enabled || draft.length !== CODE_LENGTH);
    box.append(slots, palette, submit);
    return box;
  }

  function setSecret(code: Code) {
    void session.setSecret(code).then((ok) => {
      if (!ok && session.view().phase === 'setup') {
        showMessage('正解を封印できませんでした。https のページで開き直してください。', [button('戻る', ctx.onBack)]);
      }
    });
  }

  // 自分の推測と相手の推測を横に並べる。今の番の側を光らせる
  function boards(v: ReturnType<HbSession['view']>) {
    const playing = v.phase === 'playing';
    const mine = el('section', `hb-board${playing && (v.myTurn || v.waitingResult) ? ' active' : ''}`);
    mine.append(
      el('h3', '', 'あなたの推測'),
      el('div', 'sub', `${opp}の正解を当てる（${v.myHistory.length} / ${MAX_TURNS}）`),
      historyList(v.myHistory),
    );
    const theirs = el('section', `hb-board${playing && !v.myTurn && !v.waitingResult ? ' active' : ''}`);
    const target = el('div', 'hb-target');
    target.append(el('span', 'sub', 'あなたの正解'), ballsRow(v.mySecret ?? [], 'row small'));
    theirs.append(
      el('h3', '', `${opp}の推測`),
      el('div', 'sub', `あなたの正解を当てに来る（${v.oppHistory.length} / ${MAX_TURNS}）`),
      target,
      historyList(v.oppHistory),
    );
    const wrap = el('div', 'hb-boards');
    wrap.append(mine, theirs);
    return wrap;
  }

  function render() {
    if (disposed) return;
    const v = session.view();
    const me = session.me;
    watchStall(v.waitingResult || v.phase === 'revealing');
    const nodes: Node[] = [];
    switch (v.phase) {
      case 'setup':
        showMessage(`${opp}に当ててもらう正解を決めてください`, [composer('この並びに決める', true, setSecret)]);
        return;
      case 'waiting':
        showMessage(`${opp}が正解を決めるのを待っています…`, [el('div', 'sub', 'あなたの正解'), ballsRow(v.mySecret!)]);
        return;
      case 'playing': {
        const turn = v.myHistory.length + (v.myTurn ? 1 : 0);
        const status = v.myTurn ? `あなたの番です（${turn} / ${MAX_TURNS}）` : v.waitingResult ? '判定を待っています…' : `${opp}の番です`;
        nodes.push(boards(v));
        nodes.push(composer('決定', v.myTurn, (c) => session.guess(c)));
        showMessage(status, nodes);
        return;
      }
      case 'revealing':
        showMessage(`${opp}の正解を確かめています…`, [boards(v)]);
        return;
      case 'ended': {
        const text = v.outcome ? outcomeText(v.outcome, me, vsCpu) : `${opp}が切断しました`;
        nodes.push(el('div', 'sub', 'あなたの正解'), ballsRow(v.mySecret ?? []));
        if (v.oppSecret) nodes.push(el('div', 'sub', `${opp}の正解`), ballsRow(v.oppSecret));
        else if (v.outcome && v.outcome.reason !== 'disconnect') nodes.push(el('div', 'sub', `${opp}の正解は確かめられませんでした`));
        nodes.push(boards(v));
        // ネット対戦のもう一度は、部屋を作った人が選択画面から選び直す
        if (vsCpu) nodes.push(button('もう一度', start));
        nodes.push(button('戻る', ctx.onBack));
        showMessage(text, nodes);
        return;
      }
    }
  }

  if (mode.kind === 'online') {
    offMessage = pairLink(mode.link, mode.seat).onMessage((data) => {
      const m: HbMsg | null = decodeHb(data);
      if (m) void session.receive(m);
    });
  }
  start();

  return {
    playerLeft: (seat) => {
      if (mode.kind === 'online' && seat !== mode.seat) session.disconnected();
    },
    dispose() {
      disposed = true;
      watchStall(false);
      offMessage();
      cpu?.dispose();
    },
  };
}

export const hitBlowGame: GameModule = {
  id: 'hb',
  title: 'ヒットアンドブロー',
  description: '6色から4つ並べた相手の正解を当て合う',
  hasPractice: false,
  mount,
};
