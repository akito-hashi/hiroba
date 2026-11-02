import { decode } from '../net/protocol';
import { BOARD_H, PANEL_W, drawBoard } from '../ui/render';
import { CpuSession, OnlineSession, type Session, SoloSession, type Ui } from '../ui/screens';
import { type GameContext, type GameInstance, type GameModule, pairLink } from './types';

const GAP = 24;
// ネオン枠の光が切れないよう、外周に余白をとる
const MARGIN = 18;
const WIDTH = PANEL_W * 2 + GAP + MARGIN * 2;
const HEIGHT = BOARD_H + MARGIN * 2;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, id = '', className = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (className) e.className = className;
  return e;
}

function mount(ctx: GameContext): GameInstance {
  const stage = el('div', 'stage');
  const canvas = el('canvas', 'canvas');
  const overlay = el('div', 'overlay');
  const message = el('div', 'message');
  message.hidden = true;
  overlay.append(message);
  stage.append(canvas, overlay);
  // 操作説明はキーの形で見せる（戻るは画面上の帯にある）
  const help = el('div', '', 'keys');
  for (const [keys, label] of [
    [['←', '→'], '移動'],
    [['↑'], '即落とし'],
    [['↓'], '速く落とす'],
    [['Z', 'X'], '回転'],
  ] as const) {
    const item = el('span', '', 'key-item');
    for (const k of keys) {
      const kbd = el('kbd');
      kbd.textContent = k;
      item.append(kbd);
    }
    item.append(label);
    help.append(item);
  }
  ctx.root.replaceChildren(stage, help);

  const g = canvas.getContext('2d')!;
  // 高解像度ディスプレイでぼやけないようにする
  const dpr = window.devicePixelRatio || 1;
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  g.scale(dpr, dpr);

  const ui: Ui = {
    showMenu: () => ctx.onBack(),
    showMessage(text, buttons = []) {
      message.hidden = false;
      message.replaceChildren();
      for (const line of text.split('\n')) {
        const p = document.createElement('div');
        p.textContent = line;
        message.append(p);
      }
      const row = el('div', '', 'row');
      for (const b of buttons) {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        btn.addEventListener('click', b.onClick);
        row.append(btn);
      }
      if (buttons.length > 0) message.append(row);
    },
    hideOverlay() {
      message.hidden = true;
    },
  };

  let session: Session;
  let offMessage = () => {};
  const mode = ctx.mode;
  if (mode.kind === 'practice') session = new SoloSession(ui);
  else if (mode.kind === 'cpu') session = new CpuSession(ui, mode.level);
  else {
    const link = pairLink(mode.link, mode.seat);
    const online = new OnlineSession(ui, mode.seat === 0 ? 0 : 1, (m) => link.send(m));
    offMessage = link.onMessage((data) => {
      const m = decode(data);
      if (m) online.onMessage(m);
    });
    session = online;
  }

  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const dt = now - last;
    last = now;
    try {
      session.update(dt);
      // 盤面の外は透明にして、ページの背景をそのまま見せる
      g.clearRect(0, 0, WIDTH, HEIGHT);
      const views = session.views();
      // ひとりのときは中央、二人のときは左右に並べる
      const startX = views.length === 1 ? (WIDTH - PANEL_W) / 2 : MARGIN;
      views.forEach((v, i) => drawBoard(g, v, startX + i * (PANEL_W + GAP), MARGIN));
    } finally {
      // 1フレームで例外が起きても、ゲームループ自体は止めない
      raf = requestAnimationFrame(frame);
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    playerLeft: (seat) => {
      if (session instanceof OnlineSession && mode.kind === 'online' && seat !== mode.seat) session.opponentLeft();
    },
    dispose() {
      cancelAnimationFrame(raf);
      offMessage();
      session.dispose();
    },
  };
}

export const sixGame: GameModule = {
  id: 'six',
  title: 'シックスボールパズル',
  description: '同じ色を6つ繋げて消す落ち物パズル',
  hasPractice: true,
  mount,
};
