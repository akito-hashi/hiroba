import { PITCH_KINDS, PITCH_LABELS, SWING_TICKS, type Steer, TICK_SEC } from '../baseball/field';
import { decodeBb } from '../baseball/protocol';
import { type BaseballState, battingSide, type Outcome, type PitchResult, type Side } from '../baseball/rules';
// 型だけ読む。three を含む本体はゲームを開いたときに読み込む（トップの読み込みを軽くするため）
import type { BaseballScene, SceneView } from '../baseball/scene';
import { BaseballSession, type View } from '../baseball/session';
import { CpuMatch } from '../baseball/cpu';
import { type CpuLevel, type GameContext, type GameInstance, type GameModule, pairLink } from './types';

const CPU_LABELS: Record<CpuLevel, string> = { weak: 'よわい', normal: 'ふつう', strong: 'つよい' };

// 相手の投球・判定をこれ以上待たされたら、相手の負けにする
const STALL_LIMIT_MS = 90_000;
// タブが裏にあった後などに一気に進めすぎないための上限。超えた分は捨てる
const MAX_STEPS_PER_FRAME = 30;
// 得点の演出を出しておく時間
const SCORE_FX_MS = 2000;

const RESULT_LABELS: Record<PitchResult, string> = {
  ball: 'ボール',
  strike: 'ストライク',
  foul: 'ファウル',
  single: 'ヒット',
  double: '二塁打',
  triple: '三塁打',
  homer: 'ホームラン！',
  out: 'アウト',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void) {
  const b = el('button', '', label);
  b.addEventListener('click', onClick);
  return b;
}

// キーの案内（例: [Space] 投げる）
function keyHelp(...items: [string, string][]) {
  const box = el('div', 'keys');
  for (const [key, label] of items) {
    const item = el('span', 'key-item');
    for (const k of key.split(' ')) item.append(el('kbd', '', k));
    item.append(label);
    box.append(item);
  }
  return box;
}

function outcomeText(o: Outcome, me: Side) {
  if (o.reason === 'disconnect') return '相手が切断しました。あなたの勝ち！';
  if (o.reason === 'stalled') return '相手から応答がありません。あなたの勝ち！';
  if (o.winner === 'draw') return '引き分け';
  return o.winner === me ? 'あなたの勝ち！' : 'あなたの負け…';
}

// 得点の演出: 大きな「◯点！」と、上から舞う紙吹雪
const CONFETTI_COLORS = ['#ff3fd2', '#ffe81a', '#4fb7ff', '#5fcf7a', '#ff8a3d', '#ffffff'];
function scoreEffect(runs: number, who: string) {
  const box = el('div', 'bb-score-fx');
  for (let i = 0; i < 40; i++) {
    const piece = el('span', 'bb-confetti');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
    piece.style.setProperty('--spin', `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`);
    box.append(piece);
  }
  const text = el('div', 'bb-score-pop');
  text.append(el('div', 'bb-score-pop-runs', `${runs}点！`), el('div', 'bb-score-pop-who', `${who}の得点`));
  box.append(text);
  return box;
}

// B・S・O のランプ1列
function lamps(label: string, lit: number, total: number) {
  const row = el('div', `bb-lamps bb-lamps-${label.toLowerCase()}`);
  row.append(el('span', 'bb-lamp-label', label));
  for (let i = 0; i < total; i++) row.append(el('span', i < lit ? 'bb-lamp on' : 'bb-lamp'));
  return row;
}

function scoreBoard(state: BaseballState, names: string[], me: Side, scored: Side | null) {
  const box = el('div', 'bb-score');
  ([0, 1] as const).forEach((side) => {
    const row = el('div', side === me ? 'bb-score-row me' : 'bb-score-row');
    if (battingSide(state) === side && !state.outcome) row.classList.add('batting');
    if (scored === side) row.classList.add('scored');
    row.append(el('span', 'bb-score-name', names[side] ?? ''), el('span', 'bb-score-runs', `${state.score[side]}`));
    box.append(row);
  });
  return box;
}

function mount(ctx: GameContext): GameInstance {
  const app = el('div', 'bb-app');
  ctx.root.replaceChildren(app);
  const mode = ctx.mode;
  if (mode.kind === 'practice') {
    app.append(el('div', 'status', 'CPU 対戦か、広場の卓で遊べます'), button('戻る', ctx.onBack));
    return { playerLeft: () => {}, dispose: () => {} };
  }

  const link = mode.kind === 'online' ? pairLink(mode.link, mode.seat) : null;
  // CPU 対戦では、あなたが席0（先攻）
  const me: Side = mode.kind === 'online' && mode.seat !== 0 ? 1 : 0;
  const names = mode.kind === 'online' ? mode.names : ['あなた', `CPU ${CPU_LABELS[mode.level]}`];
  // CPU 対戦は同じブラウザの中で CPU 側のセッションも動かす。「もう一度」で作り直す
  let match: CpuMatch | null = null;
  let session!: BaseballSession;

  const stage = el('div', 'bb-stage');
  const canvasBox = el('div', 'bb-canvas');
  const hud = el('div', 'bb-hud');
  // 得点の演出は HUD の作り直しで途切れないよう、別の層に出す
  const fxLayer = el('div', 'bb-fx');
  stage.append(canvasBox, hud, fxLayer);
  app.append(stage);

  let scene: BaseballScene | null = null;
  let loadFailed = false;
  let resizeObserver: ResizeObserver | null = null;
  let frame: number | null = null;
  let lastTime = 0;
  let carry = 0; // 次のフレームに持ち越す、まだ進めていない時間（秒）
  let stallTimer: number | null = null;
  let hudKey = '';
  let disposed = false;
  // 押している矢印キー
  const held = { left: false, right: false };

  // 相手の投球・判定を待っている間だけタイマーを動かす
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

  function start() {
    if (mode.kind === 'online') session = new BaseballSession(me, (m) => link!.send(m));
    else if (mode.kind === 'cpu') {
      match = new CpuMatch(mode.level, Math.random);
      session = match.session;
    }
    session.onChange = update;
    shown = session.view().state;
    hudKey = '';
    shownScore = [0, 0];
    clearScoreFx();
  }

  // 表示している得点が増えたら、「◯点！」と紙吹雪を出し、得点板のその行を光らせる
  let shownScore: [number, number] = [0, 0];
  let scoredSide: Side | null = null;
  let fxTimer: number | null = null;
  function clearScoreFx() {
    if (fxTimer !== null) clearTimeout(fxTimer);
    fxTimer = null;
    scoredSide = null;
    fxLayer.replaceChildren();
  }
  function watchScore(s: BaseballState) {
    const prev = shownScore;
    shownScore = [...s.score];
    const side = ([0, 1] as const).find((i) => s.score[i] > prev[i]);
    if (side === undefined) return;
    clearScoreFx();
    scoredSide = side;
    fxLayer.append(scoreEffect(s.score[side] - prev[side], side === me ? 'あなた' : names[side] ?? ''));
    fxTimer = window.setTimeout(() => {
      clearScoreFx();
      update();
    }, SCORE_FX_MS);
  }

  // 打者側は打った瞬間に結果を記録するので、打球が転がっている間は直前の状態を見せる
  // （得点・カウント・走者・攻守が、球が止まる前に変わって結果がばれないように）
  let shown: BaseballState;
  const shownState = (v: View) => (v.phase.kind === 'rolling' ? shown : (shown = v.state));
  const shownRole = (s: BaseballState): View['role'] => (s.outcome ? 'none' : battingSide(s) === me ? 'batter' : 'pitcher');

  const steerDir = (): Steer => (held.left === held.right ? 0 : held.left ? -1 : 1);

  function sceneView(v: View): SceneView {
    const p = v.phase;
    let ball: SceneView['ball'] = null;
    let swingProgress: SceneView['swingProgress'] = null;
    if (p.kind === 'pitching') {
      ball = p.ball.pos;
      if (v.role === 'batter' && p.swingTick !== null) {
        swingProgress = Math.min(1, Math.max(0, (p.tick - p.swingTick) / SWING_TICKS));
      }
    } else if (p.kind === 'rolling') ball = p.ball.pos;
    const s = shownState(v);
    return { ball, swingProgress, bases: s.bases, battingSide: battingSide(s) };
  }

  // 重ねて表示する文字やボタン。中身が変わったときだけ作り直す
  function renderHud(v: View) {
    const showResult = v.phase.kind === 'pause' && v.lastResult !== null;
    const ended = v.state.outcome !== null && v.phase.kind !== 'rolling' && v.phase.kind !== 'pause'; // 最後の1球の結果も見せてから終了表示
    const s = shownState(v);
    watchScore(s);
    const role = shownRole(s);
    const key = JSON.stringify([scene !== null, loadFailed, s, role, v.selectedKind, v.phase.kind, showResult && v.lastResult, ended, scoredSide]);
    if (key === hudKey) return;
    hudKey = key;
    if (!scene) {
      const box = el('div', 'bb-center');
      if (loadFailed) box.append(el('div', 'status', '読み込めませんでした。ページを開き直してください。'), button('戻る', ctx.onBack));
      else box.append(el('div', 'status', '読み込み中…'));
      hud.replaceChildren(box);
      return;
    }
    const nodes: Node[] = [];

    const top = el('div', 'bb-top');
    top.append(el('div', 'bb-inning', `${s.inning}回${s.half === 'top' ? '表' : '裏'}`));
    if (role !== 'none') top.append(el('div', 'bb-role', role === 'pitcher' ? 'あなたは投手' : 'あなたは打者'));
    nodes.push(top);

    nodes.push(scoreBoard(s, names, me, scoredSide));
    const bso = el('div', 'bb-bso');
    bso.append(lamps('B', s.balls, 3), lamps('S', s.strikes, 2), lamps('O', s.outs, 2));
    nodes.push(bso);

    if (role === 'pitcher') {
      const panel = el('div', 'bb-pitch');
      const kinds = el('div', 'bb-kinds');
      PITCH_KINDS.forEach((k, i) => {
        const b = el('button', k === v.selectedKind ? 'selected' : '');
        b.append(el('kbd', '', `${i + 1}`), PITCH_LABELS[k]);
        // ボタンにフォーカスを移さない（Space で押されてしまうため）
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => session.selectKind(k));
        kinds.append(b);
      });
      panel.append(kinds, keyHelp(['1 2 3 4', '球種'], ['Space', '投げる'], ['← →', '曲げる']));
      nodes.push(panel);
    } else if (role === 'batter') {
      const panel = el('div', 'bb-pitch');
      panel.append(keyHelp(['Space', '振る']));
      nodes.push(panel);
    }

    if (showResult && !ended) nodes.push(el('div', `bb-result bb-result-${v.lastResult}`, RESULT_LABELS[v.lastResult!]));

    if (ended) {
      const end = el('div', 'bb-end');
      end.append(el('div', 'status', outcomeText(s.outcome!, me)));
      // ネット対戦の再戦は、卓の主が卓の画面から開始し直す
      if (match) end.append(button('もう一度', start));
      end.append(button('戻る', ctx.onBack));
      nodes.push(end);
    }
    hud.replaceChildren(...nodes);
  }

  function update() {
    if (disposed) return;
    const v = session.view();
    // CPU は必ず応じるので、待ち時間の決着はネット対戦だけ
    watchStall(link !== null && v.waitingForOpponent);
    renderHud(v);
  }

  function loop(now: number) {
    if (disposed || !scene) return;
    carry += (now - lastTime) / 1000;
    lastTime = now;
    let steps = Math.floor(carry / TICK_SEC);
    if (steps > MAX_STEPS_PER_FRAME) {
      steps = MAX_STEPS_PER_FRAME;
      carry = 0;
    } else carry -= steps * TICK_SEC;
    // 曲げは投球ごとに 0 に戻るので、押しっぱなしの向きを毎フレームかけ直す（変化がなければ送られない）
    session.steer(steerDir());
    for (let i = 0; i < steps; i++) {
      if (match) match.step();
      else session.step();
    }
    const v = session.view();
    scene.render(sceneView(v));
    update();
    frame = requestAnimationFrame(loop);
  }

  // 文字入力中のキーは拾わない
  const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

  function onKeyDown(e: KeyboardEvent) {
    if (!scene || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const isSpace = e.code === 'Space' || e.key === ' ';
    if (isSpace || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
    if (e.repeat) return;
    const role = session.view().role;
    if (isSpace) {
      if (role === 'pitcher') session.pitch();
      else if (role === 'batter') session.swing();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      held[e.key === 'ArrowLeft' ? 'left' : 'right'] = true;
      session.steer(steerDir());
    } else {
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) session.selectKind(PITCH_KINDS[i]);
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (typing(e)) return;
    if (e.code === 'Space' || e.key === ' ') e.preventDefault();
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    held[e.key === 'ArrowLeft' ? 'left' : 'right'] = false;
    session.steer(steerDir());
  }

  // 別のウィンドウに移ると keyup が来ないので、押していたキーを離したことにする
  function onBlur() {
    held.left = false;
    held.right = false;
    session.steer(0);
  }

  start();
  const offMessage =
    link?.onMessage((data) => {
      const m = decodeBb(data);
      if (m) session.receive(m);
    }) ?? (() => {});
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  update();

  import('../baseball/scene').then(
    ({ BaseballScene }) => {
      if (disposed) return;
      try {
        scene = new BaseballScene(canvasBox);
      } catch {
        // WebGL が使えない・コンテキスト上限など
        loadFailed = true;
        update();
        return;
      }
      resizeObserver = new ResizeObserver(() => scene?.resize());
      resizeObserver.observe(canvasBox);
      update();
      lastTime = performance.now();
      frame = requestAnimationFrame(loop);
    },
    () => {
      loadFailed = true;
      update();
    },
  );

  return {
    playerLeft: (seat) => {
      if (mode.kind === 'online' && seat !== mode.seat) session.opponentLeft();
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      offMessage();
      watchStall(false);
      clearScoreFx();
      resizeObserver?.disconnect();
      scene?.dispose();
    },
  };
}

export const baseballGame: GameModule = {
  id: 'baseball',
  title: 'トイベースボール',
  description: '球種と曲げで打者を惑わせ、タイミングよく打ち返す',
  hasPractice: false,
  mount,
};
