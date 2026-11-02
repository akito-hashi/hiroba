import type { Ranking, YachtState } from './game';
import { CATEGORIES, CATEGORY_LABELS, type Category, MAX_ROLLS, UPPER, UPPER_BONUS, UPPER_BONUS_THRESHOLD, scoreFor, total, upperBonus, upperTotal } from './rules';

// 画面の部品を組み立てるだけ。状態は持たない
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
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

// 3×3 のマスのうち、目の点を打つ位置
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function dieFace(face: number | undefined): HTMLElement {
  const grid = el('span', 'pips');
  for (let i = 0; i < 9; i++) grid.append(el('span', face && PIPS[face].includes(i) ? 'pip on' : 'pip'));
  return grid;
}

// 振った直後の描画だけサイコロを揺らす（同じ振りの再描画では揺らさない）
let lastRollKey = '';

export type DiceProps = { state: YachtState; canAct: boolean; onHold: (i: number) => void; onRoll: () => void };

// 手番の人・残り回数・サイコロ5個・「振る」
export function diceArea({ state, canAct, onHold, onRoll }: DiceProps): HTMLElement {
  const box = el('div', 'dice-area');
  const who = state.players[state.current]?.name ?? '';
  box.append(el('div', `turn-banner${canAct ? ' mine' : ''}`, state.ended ? '終了' : `${who} の番`));
  const rollKey = `${state.current}:${state.rollsUsed}:${state.players.map((p) => Object.keys(p.sheet).length).join(',')}`;
  const justRolled = state.dice.length > 0 && rollKey !== lastRollKey;
  lastRollKey = rollKey;
  const row = el('div', 'row dice');
  const canHold = canAct && state.rollsUsed >= 1 && state.rollsUsed < MAX_ROLLS;
  for (let i = 0; i < 5; i++) {
    const face = state.dice[i];
    const held = state.held[i];
    const b = button('', () => onHold(i), !canHold);
    b.className = `die${held ? ' held' : ''}${face ? '' : ' blank'}${justRolled && !held ? ' rolling' : ''}`;
    b.style.animationDelay = `${i * 40}ms`;
    b.append(dieFace(face));
    if (held) b.append(el('span', 'keep', 'KEEP'));
    b.setAttribute('aria-label', face ? `${face}${held ? '（残す）' : ''}` : 'まだ振っていない');
    row.append(b);
  }
  box.append(row);
  box.append(el('div', 'sub', canHold ? 'サイコロを押すと残す／戻すを切り替え' : ' '));
  // 残り回数は点で見せる
  const left = MAX_ROLLS - state.rollsUsed;
  const roll = button('', onRoll, !canAct || left <= 0);
  roll.className = 'primary roll';
  roll.append(el('span', '', state.rollsUsed === 0 ? 'サイコロを振る' : 'もう一度振る'));
  const dots = el('span', 'roll-dots');
  for (let i = 0; i < MAX_ROLLS; i++) dots.append(el('span', i < left ? 'dot on' : 'dot'));
  roll.append(dots);
  box.append(roll);
  return box;
}

export type TableProps = { state: YachtState; mySeat: number | null; online?: boolean[]; onScore?: (c: Category) => void };

// 全員分の得点表。自分の手番で振った後は、空欄に記入したときの点を薄く出し、押すと記入する
export function scoreTable({ state, mySeat, online, onScore }: TableProps): HTMLElement {
  const table = el('table', 'sheet');
  const head = el('tr');
  head.append(el('th'));
  state.players.forEach((p, i) => {
    const th = el('th', i === state.current && !state.ended ? 'turn' : '', p.name);
    if (p.removed) th.classList.add('removed');
    else if (online && !online[i]) th.classList.add('away');
    head.append(th);
  });
  table.append(head);

  const canScore = mySeat !== null && mySeat === state.current && !state.ended && state.rollsUsed >= 1 && onScore;
  const addRow = (label: string, cell: (seat: number) => HTMLTableCellElement, className = '') => {
    const tr = el('tr', className);
    tr.append(el('th', '', label));
    state.players.forEach((_, i) => tr.append(cell(i)));
    table.append(tr);
  };
  // 記入できる欄のうち一番点が高いものを目立たせる
  const best =
    canScore && mySeat !== null
      ? Math.max(...CATEGORIES.filter((c) => state.players[mySeat].sheet[c] === undefined).map((c) => scoreFor(c, state.dice)))
      : -1;
  const catRow = (c: Category) =>
    addRow(CATEGORY_LABELS[c], (i) => {
      const v = state.players[i].sheet[c];
      if (v !== undefined) return el('td', 'filled', String(v));
      if (canScore && i === mySeat) {
        const pts = scoreFor(c, state.dice);
        const td = el('td', `option${pts === best && pts > 0 ? ' best' : ''}${pts === 0 ? ' zero' : ''}`, String(pts));
        td.addEventListener('click', () => onScore(c));
        return td;
      }
      return el('td');
    });

  UPPER.forEach(catRow);
  addRow('小計', (i) => el('td', 'sub', `${upperTotal(state.players[i].sheet)}/${UPPER_BONUS_THRESHOLD}`), 'subtotal');
  addRow(`ボーナス +${UPPER_BONUS}`, (i) => el('td', '', String(upperBonus(state.players[i].sheet))), 'subtotal');
  CATEGORIES.filter((c) => !UPPER.includes(c)).forEach(catRow);
  addRow('合計', (i) => el('td', '', String(total(state.players[i].sheet))), 'total');
  return table;
}

export function results(ranking: Ranking): HTMLElement {
  const list = el('ol', 'results');
  const winners = ranking.filter((r) => r.rank === 1);
  list.append(el('div', 'status', winners.length > 1 ? `${winners.map((w) => w.name).join('・')} が同点で1位！` : `${winners[0]?.name} の勝ち！`));
  for (const r of ranking) {
    const li = el('li');
    li.append(el('span', 'rank', `${r.rank}位`), el('span', '', r.name), el('span', 'score', `${r.total}点`));
    list.append(li);
  }
  return list;
}
