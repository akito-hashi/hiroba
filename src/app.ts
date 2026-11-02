import './ui/style.css';
import './hitblow/style.css';
import './yacht/style.css';
import './baseball/style.css';
import './ludo/style.css';
import './ui/theme.css';
import './ui/shell.css';
import { baseballGame } from './games/baseball';
import { hitBlowGame } from './games/hitblow';
import { ludoGame } from './games/ludo';
import { sixGame } from './games/six';
import { yachtGame } from './games/yacht';
import type { CpuLevel, GameInstance, GameModule, PlayMode } from './games/types';
import { type Connection, hostHub, joinRoom } from './net/peer';
import { PlazaClient } from './plaza/client';
import { Hub } from './plaza/hub';
import { type FromHub, type ToHub, decodeFromHub, decodeToHub } from './plaza/protocol';
import { GAME_LIMITS, type GameId, NAME_MAX, type Table } from './plaza/state';
import { avatarOf, playersText } from './ui/people';

// 順番に交代するゲームもあるので、少し画面を離れたくらいでは切断扱いにしない
const PEER_OPTIONS = { silenceLimitMs: 60_000 };

const GAMES: GameModule[] = [sixGame, yachtGame, hitBlowGame, ludoGame, baseballGame];
// 別の作業で作っているゲーム。できたら GAMES に加える。
const COMING_SOON: { title: string; description: string }[] = [];

const LEVELS: { level: CpuLevel; label: string }[] = [
  { level: 'weak', label: 'よわい' },
  { level: 'normal', label: 'ふつう' },
  { level: 'strong', label: 'つよい' },
];

const root = document.querySelector<HTMLDivElement>('#root')!;

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

function panel(title: string, ...children: Node[]) {
  const p = el('div', 'panel');
  p.append(el('h2', '', title), ...children);
  root.replaceChildren(p);
}

// ---- 今動いているゲームと広場 ----
let current: GameInstance | null = null;
// 広場で遊んでいる最中のゲーム（どの卓の何回目の開始か）
let currentKey: string | null = null;
let client: PlazaClient | null = null;
let hub: Hub | null = null;
let conn: Connection<ToHub> | null = null;
let cancelPeer: (() => void) | null = null;
let inviteUrl: string | null = null;
// 自分から戻ったゲーム。広場の状態がまだ「遊んでいる最中」でも開き直さない
const dismissed = new Set<string>();

function stopGame() {
  current?.dispose();
  current = null;
  currentKey = null;
}

function leaveRoom() {
  stopGame();
  const c = conn;
  conn = null;
  client = null;
  hub = null;
  inviteUrl = null;
  dismissed.clear();
  c?.close();
  cancelPeer?.();
  cancelPeer = null;
  history.replaceState(null, '', location.pathname);
}

function modeLabel(mode: PlayMode) {
  if (mode.kind === 'practice') return '練習';
  if (mode.kind === 'online') return '友達と対戦';
  return `CPU ${LEVELS.find((l) => l.level === mode.level)?.label ?? ''}`;
}

// ゲーム画面の上の帯: 戻る・ゲーム名・遊び方
function startGame(game: GameModule, mode: PlayMode, onBack: () => void) {
  stopGame();
  const bar = el('div', 'game-bar');
  const back = button('← 戻る', onBack);
  back.className = 'ghost';
  bar.append(back, el('div', 'game-title', game.title), el('span', 'badge', modeLabel(mode)));
  const box = el('div', 'game');
  root.replaceChildren(bar, box);
  current = game.mount({ root: box, mode, onBack });
}

// トップの各ゲームに添える小さな絵（CSS で描く）
function gameIcon(id: GameId) {
  const icon = el('div', `icon icon-${id}`);
  const parts = { six: 3, yacht: 5, hb: 4, ludo: 4, baseball: 3 }[id];
  for (let i = 0; i < parts; i++) icon.append(el('span'));
  return icon;
}

// ゲームごとの差し色（タイルの光や枠に使う）
const ACCENTS: Record<GameId, string> = {
  six: '#ff3fd2',
  yacht: '#38e1ff',
  hb: '#ffb347',
  ludo: '#3ddc84',
  baseball: '#7aa7ff',
};

// 名前の頭文字が入った丸いアイコン。広場の名前は重ならない（同じ名前には番号が付く）ので、
// 色は名前から決め、名前の入力中に見せる色と広場での色をそろえる
function avatar(name: string, size: 'sm' | 'md' | 'lg' = 'md') {
  const { initial, hue } = avatarOf(name, name);
  const a = el('span', `avatar ${size}`, initial);
  a.style.setProperty('--hue', String(hue));
  a.title = name;
  return a;
}

// 画面の入れ物。panel より広く使い、画面ごとにレイアウトを変える
function screen(kind: string, ...children: Node[]) {
  const s = el('div', `screen ${kind}`);
  s.append(...children);
  root.replaceChildren(s);
}

// ---- CPU の強さ（トップで1か所だけ選び、次に開いたときも覚えておく） ----
const LEVEL_KEY = 'asobi-level';

function loadLevel(): CpuLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === 'weak' || v === 'normal' || v === 'strong') return v;
  } catch {
    /* 読めなければ「ふつう」 */
  }
  return 'normal';
}

function levelPicker(level: CpuLevel, onChange: (l: CpuLevel) => void) {
  const box = el('div', 'segmented');
  box.setAttribute('role', 'radiogroup');
  box.setAttribute('aria-label', 'CPU の強さ');
  for (const { level: l, label } of LEVELS) {
    const b = button(label, () => {
      try {
        localStorage.setItem(LEVEL_KEY, l);
      } catch {
        /* 保存できなくても続ける */
      }
      onChange(l);
    });
    b.className = `seg${l === level ? ' on' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(l === level));
    box.append(b);
  }
  return box;
}

function gameTile(g: GameModule, level: CpuLevel) {
  const tile = el('article', 'tile');
  tile.dataset.game = g.id;
  tile.style.setProperty('--accent', ACCENTS[g.id]);
  const art = el('div', 'tile-art');
  art.append(gameIcon(g.id));
  const chips = el('div', 'chips');
  chips.append(el('span', 'chip', `友達と ${playersText(GAME_LIMITS[g.id])}`));
  const body = el('div', 'tile-body');
  body.append(el('h3', '', g.title), el('p', 'tile-desc', g.description), chips);
  const actions = el('div', 'tile-actions');
  const play = button('ひとりで遊ぶ', () => startGame(g, { kind: 'cpu', level }, showTop));
  play.className = 'primary';
  actions.append(play);
  if (g.hasPractice) {
    const practice = button('練習', () => startGame(g, { kind: 'practice' }, showTop));
    practice.className = 'outline';
    actions.append(practice);
  }
  tile.append(art, body, actions);
  return tile;
}

// ---- トップ: 上に「友達と遊ぶ」、下にゲームのタイル。CPU の強さは1か所で選ぶ ----
function showTop() {
  leaveRoom();
  renderTop(loadLevel());
}

function renderTop(level: CpuLevel) {
  const friends = button('友達と遊ぶ（部屋を作る）', host);
  friends.className = 'primary big';
  const hero = el('section', 'hero');
  hero.append(
    el('div', 'hero-kicker', `ブラウザで遊べる ${GAMES.length}つのゲーム`),
    el('h2', 'hero-title', '友達と、すぐ遊べる。'),
    el('p', 'hero-text', '部屋を作って招待 URL を送るだけ。友達は登録なしで参加できます。'),
    friends,
  );
  const head = el('div', 'section-head');
  const picker = el('div', 'picker');
  picker.append(el('span', 'picker-label', 'CPU の強さ'), levelPicker(level, renderTop));
  head.append(el('h2', 'section-title', 'ひとりで遊ぶ'), picker);
  const tiles = el('div', 'tiles');
  for (const g of GAMES) tiles.append(gameTile(g, level));
  for (const g of COMING_SOON) tiles.append(comingSoonCard(g));
  screen('top', hero, head, tiles);
}

function comingSoonCard(g: { title: string; description: string }) {
  const card = el('article', 'tile soon');
  const body = el('div', 'tile-body');
  body.append(el('h3', '', g.title), el('p', 'tile-desc', `${g.description}（準備中）`));
  card.append(body);
  return card;
}

// ---- 友達と遊ぶ: 広場と卓 ----
const NAME_KEY = 'asobi-name';
const gameOf = (id: GameId) => GAMES.find((g) => g.id === id)!;
const tableKey = (t: Table) => `${t.id}:${t.round}`;

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function askName(title: string, onOk: (name: string) => void) {
  const input = el('input', 'name-input');
  input.maxLength = NAME_MAX * 2;
  input.placeholder = `名前（${NAME_MAX}文字まで）`;
  input.setAttribute('aria-label', '名前');
  input.value = loadName();
  // 入力に合わせて、広場で表示されるアイコンを見せる
  const preview = el('div', 'name-preview');
  const update = () => preview.replaceChildren(avatar(input.value.trim() || '?', 'lg'));
  input.addEventListener('input', update);
  update();
  const ok = button('決定', () => {
    const name = input.value.trim();
    if (!name) return input.focus();
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* 保存できなくても続ける */
    }
    onOk(name);
  });
  ok.className = 'primary big';
  input.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
  const cancel = button('やめる', showTop);
  cancel.className = 'ghost';
  const card = el('div', 'card-panel name-card');
  card.append(el('h2', '', title), preview, el('p', 'muted', 'みんなに表示される名前を入れてください'), input, ok, cancel);
  screen('center', card);
  input.focus();
}

// 広場の状態が変わるたびに、遊ぶべきゲームを開く／広場・卓の画面を描く
function renderPlaza() {
  const c = client;
  if (!c) return;
  if (c.rejected) {
    const text = { full: '広場が満員です（12人まで）', name: '名前が正しくありません', dup: 'すでに参加しています' }[c.rejected];
    panel('入れませんでした', el('div', 'status', text), button('トップへ', showTop));
    return;
  }
  if (!c.state || !c.me) return;
  const t = c.myTable();
  // 自分が遊ぶ番のゲームがあれば開く
  if (t && t.status === 'playing' && t.players.includes(c.me) && !dismissed.has(tableKey(t))) {
    if (currentKey !== tableKey(t)) playAtTable(t);
    return;
  }
  if (current) stopGame();
  if (t) showTable(t);
  else showPlaza();
}

function playAtTable(t: Table) {
  const c = client!;
  const key = tableKey(t);
  const names = t.players.map((p) => c.nameOf(p));
  const seat = t.players.indexOf(c.me);
  startGame(gameOf(t.game), { kind: 'online', seat, names, link: c.link(t.id, t.round) }, () => {
    // 戻ったら卓の画面へ。ほかの人には「抜けた」と伝わる
    dismissed.add(key);
    stopGame();
    c.request({ t: 'leftGame', table: t.id, round: t.round });
    renderPlaza();
  });
  currentKey = key;
}

function inviteBox() {
  if (!inviteUrl) return [];
  const url = inviteUrl;
  const input = el('input', 'url');
  input.readOnly = true;
  input.value = url;
  input.setAttribute('aria-label', '招待 URL');
  input.addEventListener('focus', () => input.select());
  const copy = button('コピー', () => {
    navigator.clipboard?.writeText(url).then(() => (copy.textContent = 'コピーしました'));
  });
  copy.className = 'primary';
  const row = el('div', 'invite-row');
  row.append(input, copy);
  const box = el('section', 'card-panel invite');
  box.append(el('h3', '', '友達を招待'), el('p', 'muted', 'この URL を送ると、友達は名前を入れるだけで入れます。'), row);
  return [box];
}

function statusChip(t: Table) {
  return t.status === 'playing' ? el('span', 'chip playing', '遊んでいる最中') : el('span', 'chip open', '募集中');
}

// 卓の席を、座っている人のアイコンと空席の点線で並べる
function seatRow(t: Table) {
  const c = client!;
  const { max } = GAME_LIMITS[t.game];
  const row = el('div', 'seats-mini');
  for (let i = 0; i < max; i++) {
    const id = t.seats[i];
    row.append(id ? avatar(c.nameOf(id), 'sm') : el('span', 'avatar sm empty'));
  }
  return row;
}

function tableCard(t: Table) {
  const c = client!;
  const { max } = GAME_LIMITS[t.game];
  const card = el('article', 'table-card');
  card.style.setProperty('--accent', ACCENTS[t.game]);
  const head = el('div', 'table-head');
  const title = el('div', 'table-title');
  title.append(el('h3', '', gameOf(t.game).title), el('span', 'muted', `${t.seats.length}/${max}人・卓の主 ${c.nameOf(t.seats[0])}`));
  head.append(gameIcon(t.game), title, statusChip(t));
  card.append(head, seatRow(t));
  if (t.status === 'waiting' && t.seats.length < max) {
    const join = button('この卓に入る', () => c.request({ t: 'join', table: t.id }));
    join.className = 'primary';
    card.append(join);
  }
  return card;
}

function showPlaza() {
  const c = client!;
  const s = c.state!;
  // いる人: アイコンと名前。広場を作った人と自分に印を付ける
  const members = el('section', 'card-panel members');
  members.append(el('h3', '', `いる人（${s.members.length}/12人）`));
  const list = el('ul', 'member-list');
  s.members.forEach((m, i) => {
    const li = el('li');
    li.append(avatar(m.name, 'sm'), el('span', 'member-name', m.name));
    if (i === 0) li.append(el('span', 'chip tiny', '広場の主'));
    if (m.id === c.me) li.append(el('span', 'chip tiny me', 'あなた'));
    list.append(li);
  });
  members.append(list);

  const tables = el('section', 'tables');
  tables.append(el('h3', 'section-title', 'いまある卓'));
  if (s.tables.length === 0) {
    tables.append(el('div', 'empty-note', 'まだ卓がありません。下のゲームから卓を作りましょう。'));
  }
  const grid = el('div', 'table-grid');
  for (const t of s.tables) grid.append(tableCard(t));
  tables.append(grid);

  // 卓を作る: 小さなゲームのタイル
  const create = el('section', 'create');
  create.append(el('h3', 'section-title', '卓を作る'));
  const opts = el('div', 'create-grid');
  for (const g of GAMES) {
    const b = button('', () => c.request({ t: 'create', game: g.id }));
    b.className = 'create-btn';
    b.style.setProperty('--accent', ACCENTS[g.id]);
    const text = el('span', 'create-text');
    text.append(el('strong', '', g.title), el('span', 'muted', playersText(GAME_LIMITS[g.id])));
    b.append(gameIcon(g.id), text);
    b.setAttribute('aria-label', `${g.title}の卓を作る`);
    opts.append(b);
  }
  create.append(opts);

  const leave = button(hub ? '広場を閉じる（全員解散）' : '広場を出る', showTop);
  leave.className = 'ghost';
  const side = el('div', 'plaza-side');
  side.append(...inviteBox(), members);
  const main = el('div', 'plaza-main');
  main.append(tables, create);
  const layout = el('div', 'plaza-grid');
  layout.append(main, side);
  const head = el('div', 'page-head');
  head.append(el('h2', '', '卓を選んで遊ぼう'), leave);
  screen('plaza', head, layout);
}

function showTable(t: Table) {
  const c = client!;
  const { min, max } = GAME_LIMITS[t.game];
  const owner = t.seats[0] === c.me;
  const card = el('div', 'card-panel table-room');
  card.style.setProperty('--accent', ACCENTS[t.game]);
  const head = el('div', 'table-head');
  const title = el('div', 'table-title');
  title.append(el('h2', '', `${gameOf(t.game).title}の卓`), el('span', 'muted', `${playersText({ min, max })}で遊べます`));
  head.append(gameIcon(t.game), title, statusChip(t));
  // 席: 座っている人は大きなアイコン、空席は点線
  const seats = el('div', 'seats');
  for (let i = 0; i < max; i++) {
    const id = t.seats[i];
    const seat = el('div', `seat${id ? '' : ' empty'}`);
    if (id) {
      seat.append(avatar(c.nameOf(id), 'lg'), el('span', 'seat-name', c.nameOf(id)));
      const tags = el('span', 'seat-tags');
      if (i === 0) tags.append(el('span', 'chip tiny', '卓の主'));
      if (id === c.me) tags.append(el('span', 'chip tiny me', 'あなた'));
      seat.append(tags);
    } else {
      seat.append(el('span', 'avatar lg empty'), el('span', 'seat-name muted', 'あき'));
    }
    seats.append(seat);
  }
  card.append(head, seats);
  const need = min - t.seats.length;
  if (t.status === 'playing') {
    card.append(el('p', 'status', 'ほかのメンバーが遊び終わるのを待っています…'));
  } else if (owner) {
    card.append(el('p', 'status', need > 0 ? `あと${need}人そろうと始められます` : 'そろいました。開始できます'));
    const start = button('開始', () => c.request({ t: 'start' }), need > 0);
    start.className = 'primary big';
    card.append(start);
  } else {
    card.append(el('p', 'status', need > 0 ? `あと${need}人そろうと、卓の主が開始できます` : '卓の主が開始するのを待っています…'));
  }
  const leave = button('卓を出る', () => c.request({ t: 'leaveTable' }), t.status === 'playing');
  leave.className = 'ghost';
  card.append(leave);
  screen('center', card);
}

function setupClient(send: (m: ToHub) => void) {
  const c = new PlazaClient(send);
  c.onChange = renderPlaza;
  c.onPlayerLeft = (table, round, seat) => {
    if (currentKey !== `${table}:${round}` || !current) return;
    const mine = c.state?.tables.find((t) => t.id === table);
    // 自分自身が抜けた知らせは無視（自分の画面はもう閉じている）
    if (mine && mine.players[seat] === c.me) return;
    current.playerLeft(seat);
  };
  client = c;
  return c;
}

function onError(msg: string) {
  if (conn || hub) return; // つながった後のエラーは切断検知に任せる
  cancelPeer = null;
  panel('接続できませんでした', el('div', 'status', `（${msg}）`), button('トップへ', showTop));
}

// 広場を作る（親）。全員の通信はこのブラウザを通る
function host() {
  askName('広場を作る', (name) => {
    leaveRoom();
    panel('広場を準備中…', button('やめる', showTop));
    cancelPeer = hostHub<ToHub>(
      (id) => {
        inviteUrl = `${location.origin}${location.pathname}?room=${encodeURIComponent(id)}`;
        const h = new Hub(name, (m) => client?.receive(m));
        hub = h;
        setupClient((m) => h.hostRequest(m));
        h.start();
      },
      (id) => ({
        decode: decodeToHub,
        ready: (c) => hub?.addConnection(id, (m) => c.send(m)),
        onMessage: (m) => hub?.receive(id, m),
        onClose: () => hub?.removeConnection(id),
      }),
      onError,
      PEER_OPTIONS,
    );
  });
}

// 招待 URL で参加する（子）
function join(roomId: string) {
  askName('広場に入る', (name) => {
    panel('広場に接続中…', button('やめる', showTop));
    cancelPeer = joinRoom<FromHub>(
      roomId,
      {
        decode: decodeFromHub,
        onMessage: (m) => client?.receive(m),
        onClose: () => {
          if (!conn) return; // 自分から出たとき
          conn = null;
          stopGame();
          panel('広場が解散しました', el('div', 'status', '広場を作った人との接続が切れました'), button('トップへ', showTop));
        },
      },
      (c) => {
        conn = c;
        setupClient((m) => c.send(m)).hello(name);
      },
      onError,
      PEER_OPTIONS,
    );
  });
}

// タブを閉じる・ページを離れるときは自分から通信を閉じ、ほかの人にすぐ伝わるようにする
// （閉じないと、相手は無通信の時間切れ（60秒）まで気づけない）
window.addEventListener('pagehide', () => {
  conn?.close();
  cancelPeer?.();
});

// 招待 URL（?room=ID）で開かれたら、その広場に参加する
const roomId = new URLSearchParams(location.search).get('room');
if (roomId) join(roomId);
else showTop();
