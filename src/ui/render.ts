import type { Color } from '../core/board';
import type { Triple } from '../core/game';
import { COLS, DANGER_ROW, ROWS, type Cell, rowWidth } from '../core/grid';
import type { ActiveEffect } from './effects';

// 描画に必要な最小限の情報。ローカルの Game からもネット越しの盤面からも作れる。
export type BoardView = {
  cells: (Color | null)[];
  piece: { cells: Cell[]; colors: Triple } | null;
  next: Triple;
  pending: number;
  label: string;
  wins: number;
  effects: ActiveEffect[];
};

const R = 15;
const ROW_H = R * Math.sqrt(3);
export const BOARD_W = COLS * R * 2;
export const BOARD_H = (ROWS - 1) * ROW_H + R * 2;
export const PANEL_W = BOARD_W + 96;

const NEON_PINK = '#ff3fd2';
const NEON_CYAN = '#38e1ff';

// 色ごとの地の色と柄。色相を離し、柄も形で見分けられるようにする。
const BASE: Record<Color, string> = {
  red: '#e0102a',
  blue: '#1d5cff',
  orange: '#ff6a00',
  green: '#16c45a',
  purple: '#9a35e8',
  yellow: '#ffe81a',
};

const spriteCache = new Map<string, HTMLCanvasElement>();

function drawPattern(g: CanvasRenderingContext2D, color: Color) {
  g.fillStyle = BASE[color];
  g.fillRect(-R, -R, R * 2, R * 2);
  switch (color) {
    case 'red': {
      // 赤と濃い赤のチェック（白を使わず、赤のまま見えるように）
      g.fillStyle = '#8a0014';
      const s = R / 2;
      for (let y = -R; y < R; y += s) {
        for (let x = -R; x < R; x += s) {
          if ((Math.round((x + R) / s) + Math.round((y + R) / s)) % 2 === 0) g.fillRect(x, y, s, s);
        }
      }
      break;
    }
    case 'blue': {
      // 白い渦のマーブル
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = R / 4;
      g.beginPath();
      g.arc(-R * 0.15, R * 0.1, R * 0.55, Math.PI * 0.9, Math.PI * 2.1);
      g.stroke();
      g.strokeStyle = '#60a5fa';
      g.beginPath();
      g.arc(R * 0.2, -R * 0.1, R * 0.35, Math.PI * 1.8, Math.PI * 2.9);
      g.stroke();
      break;
    }
    case 'purple': {
      // W の模様
      g.strokeStyle = '#ffffff';
      g.lineWidth = R / 5;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(-R * 0.6, -R * 0.35);
      g.lineTo(-R * 0.3, R * 0.4);
      g.lineTo(0, -R * 0.1);
      g.lineTo(R * 0.3, R * 0.4);
      g.lineTo(R * 0.6, -R * 0.35);
      g.stroke();
      break;
    }
    case 'orange': {
      // 濃いオレンジに茶色の横縞（黄色と混ざらないよう黄色は使わない）
      g.fillStyle = '#7a2e00';
      for (const y of [-R * 0.5, 0, R * 0.5]) g.fillRect(-R, y - R * 0.09, R * 2, R * 0.18);
      break;
    }
    case 'green': {
      // 明るい緑に白い格子
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = R / 8;
      const s = R / 2.2;
      for (let v = -R; v <= R; v += s) {
        g.beginPath();
        g.moveTo(v, -R);
        g.lineTo(v, R);
        g.moveTo(-R, v);
        g.lineTo(R, v);
        g.stroke();
      }
      break;
    }
    case 'yellow':
      // 無地（ツヤだけ）
      break;
  }
}

function sprite(color: Color, dpr: number): HTMLCanvasElement {
  const key = `${color}@${dpr}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(R * 2 * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  g.translate(R, R);
  g.save();
  g.beginPath();
  g.arc(0, 0, R - 1, 0, Math.PI * 2);
  g.clip();
  drawPattern(g, color);
  // 立体感: 縁を暗く、左上にツヤ
  const shade = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shade;
  g.fillRect(-R, -R, R * 2, R * 2);
  g.restore();
  // 隣のボールとの境目が分かるよう、暗い縁取り
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, R - 1.5, 0, Math.PI * 2);
  g.stroke();
  spriteCache.set(key, cv);
  return cv;
}

function center({ c, r }: Cell, ox: number, oy: number): [number, number] {
  const x = ox + R + c * R * 2 + (r % 2 === 1 ? R : 0);
  const y = oy + BOARD_H - R - r * ROW_H;
  return [x, y];
}

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, color: Color) {
  const dpr = ctx.getTransform().a;
  ctx.drawImage(sprite(color, dpr), x - R, y - R, R * 2, R * 2);
}

function neonLine(ctx: CanvasRenderingContext2D, color: string, pts: [number, number][]) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, ox: number, oy: number, now: number) {
  const bg = ctx.createLinearGradient(0, oy, 0, oy + BOARD_H);
  bg.addColorStop(0, '#0b0730');
  bg.addColorStop(1, '#1a0b3d');
  ctx.fillStyle = bg;
  ctx.fillRect(ox, oy, BOARD_W, BOARD_H);
  // ちらつく星（位置は固定、明るさだけ時間で変える）
  for (let i = 0; i < 28; i++) {
    const x = ox + ((i * 97) % BOARD_W);
    const y = oy + ((i * 53 + 17) % BOARD_H);
    ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(now / 700 + i));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function drawEffects(ctx: CanvasRenderingContext2D, effects: ActiveEffect[], ox: number, oy: number) {
  for (const e of effects) {
    const fade = 1 - e.progress;
    ctx.save();
    ctx.shadowColor = NEON_PINK;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = `rgba(255,220,250,${fade})`;
    ctx.fillStyle = `rgba(255,120,230,${fade * 0.45})`;
    ctx.lineWidth = 3;
    for (const cell of e.cells) {
      const [x, y] = center(cell, ox, oy);
      ctx.beginPath();
      ctx.arc(x, y, R * (0.8 + e.progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    if (e.label) {
      // ポンと出てから少し縮む大きな文字
      const scale = e.progress < 0.15 ? 0.6 + (e.progress / 0.15) * 0.6 : 1.2 - Math.min(0.2, (e.progress - 0.15) * 0.4);
      ctx.save();
      ctx.globalAlpha = Math.min(1, fade * 2);
      ctx.translate(ox + BOARD_W / 2, oy + BOARD_H * 0.55);
      ctx.scale(scale, scale);
      ctx.font = '900 36px "Hiragino Sans", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#1b1035';
      ctx.strokeText(e.label, 0, 0);
      ctx.shadowColor = NEON_PINK;
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(e.label, 0, 0);
      ctx.restore();
    }
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, view: BoardView, ox: number, oy: number) {
  const now = performance.now();
  drawBackground(ctx, ox, oy, now);

  // 危険ライン
  const [, lineY] = center({ c: 0, r: DANGER_ROW }, ox, oy);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,63,210,0.6)';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(ox, lineY + ROW_H / 2);
  ctx.lineTo(ox + BOARD_W, lineY + ROW_H / 2);
  ctx.stroke();
  ctx.restore();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < rowWidth(r); c++) {
      const color = view.cells[r * COLS + c];
      if (color) ball(ctx, ...center({ c, r }, ox, oy), color);
    }
  }
  view.piece?.cells.forEach((cell, i) => ball(ctx, ...center(cell, ox, oy), view.piece!.colors[i]));
  drawEffects(ctx, view.effects, ox, oy);

  // ネオンの枠（左右ピンク、床は水色）
  neonLine(ctx, NEON_PINK, [
    [ox - 2, oy],
    [ox - 2, oy + BOARD_H + 2],
  ]);
  neonLine(ctx, NEON_PINK, [
    [ox + BOARD_W + 2, oy],
    [ox + BOARD_W + 2, oy + BOARD_H + 2],
  ]);
  neonLine(ctx, NEON_CYAN, [
    [ox - 2, oy + BOARD_H + 2],
    [ox + BOARD_W + 2, oy + BOARD_H + 2],
  ]);

  // 横の情報欄
  const px = ox + BOARD_W + 16;
  ctx.fillStyle = '#f5e9ff';
  ctx.font = 'bold 15px "Hiragino Sans", sans-serif';
  ctx.fillText(view.label, px, oy + 18);
  ctx.font = '13px "Hiragino Sans", sans-serif';
  ctx.fillStyle = NEON_CYAN;
  ctx.fillText('NEXT', px, oy + 48);
  ball(ctx, px + R, oy + 70 + ROW_H, view.next[0]);
  ball(ctx, px + R * 3, oy + 70 + ROW_H, view.next[1]);
  ball(ctx, px + R * 2, oy + 70, view.next[2]);
  ctx.fillStyle = '#f5e9ff';
  ctx.fillText(`勝ち ${'★'.repeat(view.wins)}`, px, oy + 140);
  if (view.pending > 0) {
    ctx.fillStyle = NEON_PINK;
    ctx.fillText(`おじゃま ${view.pending}塊`, px, oy + 165);
  }
}
