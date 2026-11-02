import { type Cell, SIZE, TRACK_CELLS, baseHoles, cellOf, entryCell, laneCells, startCell } from './board';
import { GOAL, LudoGame, type LudoRanking, type LudoState } from './rules';

// 画面の部品を組み立てるだけ。状態は持たない
export const COLOR_NAMES = ['赤', '緑', '黄', '青'];
const COLORS = ['#e53945', '#2f9e44', '#f2c230', '#3b7dd8'];
const SVG_NS = 'http://www.w3.org/2000/svg';
// SVG の座標では1マス10。マスの中心は (c*10+5, r*10+5)
const U = 10;
const at = ({ r, c }: Cell) => ({ x: c * U + U / 2, y: r * U + U / 2 });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export function button(label: string, onClick: () => void, disabled = false) {
  const b = el('button', '', label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function die(face: number | null, rolling: boolean) {
  const d = el('div', `ludo-die${face ? '' : ' blank'}${rolling ? ' rolling' : ''}`);
  for (let i = 0; i < 9; i++) d.append(el('span', face && PIPS[face].includes(i) ? 'pip on' : 'pip'));
  return d;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

// 丸いマスに描く矢印。cell から toward の向き
function arrow(g: SVGElement, cell: Cell, toward: Cell, color: string) {
  const { x, y } = at(cell);
  const angle = (Math.atan2(toward.r - cell.r, toward.c - cell.c) * 180) / Math.PI;
  g.append(
    svg('path', {
      d: 'M -2.6 0 H 2.2 M 0.6 -1.8 L 2.6 0 L 0.6 1.8',
      stroke: color,
      'stroke-width': 1.1,
      fill: 'none',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      transform: `translate(${x} ${y}) rotate(${angle})`,
    }),
  );
}

// 盤（11×11）。線でつないだ丸いマス、四隅の陣地、色の道と矢印
function boardSvg(): SVGSVGElement {
  // 外枠は入れ物（.ludo-board）の枠線で付ける。SVG はマス目の範囲だけにして、コマの位置と合わせる
  const root = svg('svg', { viewBox: `0 0 ${SIZE * U} ${SIZE * U}`, class: 'ludo-svg' });
  // 四隅の陣地（角の丸い四角に穴4つ）
  for (let color = 0; color < 4; color++) {
    const holes = baseHoles(color);
    const cx = holes.reduce((a, h) => a + at(h).x, 0) / 4;
    const cy = holes.reduce((a, h) => a + at(h).y, 0) / 4;
    root.append(svg('rect', { x: cx - 17, y: cy - 17, width: 34, height: 34, rx: 7, fill: COLORS[color], class: 'base' }));
    for (const h of holes) root.append(svg('circle', { cx: at(h).x, cy: at(h).y, r: 4, class: 'hole' }));
  }
  // マスをつなぐ線（1周と、ゴールへの道）
  const ring = TRACK_CELLS.map(at);
  root.append(svg('polygon', { points: ring.map((q) => `${q.x},${q.y}`).join(' '), class: 'path' }));
  for (let color = 0; color < 4; color++) {
    const lane = [entryCell(color), ...laneCells(color)].map(at);
    root.append(svg('polyline', { points: lane.map((q) => `${q.x},${q.y}`).join(' '), class: 'path' }));
  }
  // 1周のマス
  for (const cell of TRACK_CELLS) root.append(svg('circle', { cx: at(cell).x, cy: at(cell).y, r: 3.8, class: 'spot' }));
  const arrows = svg('g', {});
  for (let color = 0; color < 4; color++) {
    // ゴールへの道は色付き
    for (const cell of laneCells(color)) root.append(svg('circle', { cx: at(cell).x, cy: at(cell).y, r: 3.8, fill: COLORS[color], class: 'lane' }));
    // スタートのマスは色付きに白い矢印、ゴールへの入口は白に色の矢印
    const st = startCell(color);
    root.append(svg('circle', { cx: at(st).x, cy: at(st).y, r: 3.8, fill: COLORS[color], class: 'lane' }));
    arrow(arrows, st, TRACK_CELLS[(TRACK_CELLS.indexOf(st) + 1) % TRACK_CELLS.length], '#fff');
    const en = entryCell(color);
    root.append(svg('circle', { cx: at(en).x, cy: at(en).y, r: 3.8, stroke: COLORS[color], class: 'spot entry' }));
    arrow(arrows, en, laneCells(color)[0], COLORS[color]);
  }
  root.append(arrows);
  return root;
}

// ピンの形のコマ（頭の玉と、すその広がった胴）
function pawn(color: number) {
  const p = el('span', 'pawn');
  p.style.setProperty('--pawn', COLORS[color]);
  p.append(el('span', 'pawn-body'), el('span', 'pawn-head'));
  return p;
}

export type LudoActions = { roll(): void; move(piece: number): void };

// 振った直後の描画だけサイコロを揺らす（手番が移る振りでも揺らす）
let lastRolls = -1;

export function renderLudo(app: HTMLElement, s: LudoState, mySeat: number, act: LudoActions, endButtons: HTMLElement[]) {
  const myTurn = !s.ended && s.current === mySeat;
  const legal = myTurn && s.phase === 'move' ? LudoGame.restore(s, Math.random).legalMoves() : [];

  // ---- 盤 ----
  const board = el('div', 'ludo-board');
  board.append(boardSvg());
  const layer = el('div', 'ludo-pieces');
  board.append(layer);
  // 同じマスの同じ色のコマは1つにまとめ、数を添える
  const groups = new Map<string, { cell: Cell; color: number; pieces: number[]; mine: boolean }>();
  s.players.forEach((p, seat) => {
    if (p.removed) return;
    p.pieces.forEach((progress, i) => {
      const cell = cellOf(p.color, progress, i);
      const key = `${cell.r},${cell.c},${p.color}`;
      const g = groups.get(key) ?? { cell, color: p.color, pieces: [], mine: seat === mySeat };
      g.pieces.push(i);
      groups.set(key, g);
    });
  });
  // 同じマスに別の色がいるときは少しずらす
  const perCell = new Map<string, number>();
  for (const g of groups.values()) {
    const cellKey = `${g.cell.r},${g.cell.c}`;
    const nth = perCell.get(cellKey) ?? 0;
    perCell.set(cellKey, nth + 1);
    const piece = el('button', 'ludo-piece');
    piece.style.left = `${((g.cell.c + 0.5) / SIZE) * 100 + nth * 2.2}%`;
    piece.style.top = `${((g.cell.r + 0.5) / SIZE) * 100}%`;
    piece.setAttribute('aria-label', `${COLOR_NAMES[g.color]}のコマ`);
    piece.append(pawn(g.color));
    if (g.pieces.length > 1) piece.append(el('span', 'count', String(g.pieces.length)));
    const movable = g.mine ? g.pieces.find((i) => legal.includes(i)) : undefined;
    if (movable !== undefined) {
      piece.classList.add('movable');
      piece.addEventListener('click', () => act.move(movable));
    } else {
      piece.disabled = true;
    }
    layer.append(piece);
  }

  // ---- 横の情報欄 ----
  const side = el('div', 'ludo-side');
  const cur = s.players[s.current];
  side.append(el('div', `turn-banner${myTurn ? ' mine' : ''}`, s.ended ? '終了' : `${cur.name}（${COLOR_NAMES[cur.color]}）の番`));
  side.append(die(s.dice, s.dice !== null && s.rolls !== lastRolls));
  lastRolls = s.rolls;
  if (s.ended) {
    side.append(results(LudoGame.restore(s, Math.random).ranking(), s), ...endButtons);
  } else {
    const roll = button('サイコロを振る', act.roll, !myTurn || s.phase !== 'roll');
    roll.className = 'primary roll';
    side.append(roll);
    const hint = !myTurn ? '' : s.phase === 'roll' ? (s.bonus ? '6が出たので、もう一度振れます' : '') : '光っているコマを押して動かします';
    side.append(el('div', 'sub', hint || ' '));
  }
  const list = el('ul', 'ludo-players');
  s.players.forEach((p, seat) => {
    const li = el('li', p.removed ? 'removed' : seat === s.current && !s.ended ? 'turn' : '');
    li.append(pawn(p.color), el('span', 'name', p.name), el('span', 'goal', `ゴール ${p.pieces.filter((x) => x === GOAL).length}/4`));
    list.append(li);
  });
  side.append(list);

  const wrap = el('div', 'ludo-wrap');
  wrap.append(board, side);
  app.replaceChildren(wrap);
}

function results(ranking: LudoRanking, s: LudoState) {
  const list = el('ol', 'results');
  const winner = s.winner !== null ? s.players[s.winner].name : '';
  list.append(el('div', 'status', winner ? `${winner} の勝ち！` : '終了'));
  for (const r of ranking) {
    const li = el('li');
    li.append(el('span', 'rank', `${r.rank}位`), el('span', '', r.name));
    list.append(li);
  }
  return list;
}
