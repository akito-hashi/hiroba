import { BALL_COLORS, Board, type Color } from './board';
import { GarbageQueue } from './garbage';
import { type Piece, canPlace, moveDown, moveH, pieceCells, rotate, spawnPiece } from './piece';
import { type ChunkShape, type ResolveResult, resolve } from './resolve';
import { createRng } from './rng';

export const FALL_INTERVAL_MS = 800;
const SOFT_DROP_FACTOR = 20;
// タブが裏に回って戻ったときなどに、一気に何段も落ちないよう上限を設ける
const MAX_DT_MS = FALL_INTERVAL_MS;

export type Action = 'left' | 'right' | 'rotateL' | 'rotateR' | 'hardDrop' | 'softDropOn' | 'softDropOff';
export type GameEvent =
  | { type: 'locked' }
  | { type: 'cleared'; result: ResolveResult }
  | { type: 'attack'; chunks: ChunkShape[] }
  | { type: 'lost' };
export type Triple = [Color, Color, Color];

function dropToBottom(piece: Piece, board: Board): Piece {
  let p = piece;
  let moved = moveDown(p, board);
  while (moved) {
    p = moved;
    moved = moveDown(p, board);
  }
  return p;
}

function placeAndResolve(board: Board, piece: Piece): ResolveResult {
  pieceCells(piece).forEach((cell, i) => board.set(cell, piece.colors[i]));
  return resolve(board);
}

// 盤面を変えずに「その位置から即落としした結果」を試す（CPU の読み用）
export function simulatePlacement(board: Board, piece: Piece): { board: Board; result: ResolveResult } {
  const copy = board.clone();
  const result = placeAndResolve(copy, dropToBottom(piece, copy));
  return { board: copy, result };
}

// プレイヤー1人分の盤面と進行
export class Game {
  board = new Board();
  garbage = new GarbageQueue();
  current: Piece;
  next: Triple;
  status: 'playing' | 'lost' = 'playing';
  private rng: () => number;
  // おじゃまの色はピース列と別の乱数にする（受けた攻撃で相手とピース列がずれないように）
  private garbageRng: () => number;
  private fallTimer = 0;
  private softDrop = false;
  private events: GameEvent[] = [];

  constructor(seed: number) {
    this.rng = createRng(seed);
    this.garbageRng = createRng(seed ^ 0x9a7b);
    this.current = spawnPiece(this.randomTriple());
    this.next = this.randomTriple();
  }

  private randomTriple(): Triple {
    const pick = () => BALL_COLORS[Math.floor(this.rng() * BALL_COLORS.length)];
    return [pick(), pick(), pick()];
  }

  input(action: Action): void {
    if (this.status !== 'playing') return;
    switch (action) {
      case 'left':
      case 'right':
        this.current = moveH(this.current, action === 'left' ? -1 : 1, this.board) ?? this.current;
        break;
      case 'rotateL':
        this.current = rotate(this.current, 1, this.board);
        break;
      case 'rotateR':
        this.current = rotate(this.current, -1, this.board);
        break;
      case 'hardDrop':
        this.current = dropToBottom(this.current, this.board);
        this.lock();
        break;
      case 'softDropOn':
      case 'softDropOff':
        this.softDrop = action === 'softDropOn';
        break;
    }
  }

  tick(dtMs: number): void {
    if (this.status !== 'playing') return;
    this.fallTimer += Math.min(dtMs, MAX_DT_MS);
    const interval = this.softDrop ? FALL_INTERVAL_MS / SOFT_DROP_FACTOR : FALL_INTERVAL_MS;
    if (this.fallTimer < interval) return;
    this.fallTimer = 0;
    const moved = moveDown(this.current, this.board);
    if (moved) this.current = moved;
    else this.lock();
  }

  receiveAttack(chunks: ChunkShape[]): void {
    this.garbage.add(chunks);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private reportClear(result: ResolveResult): void {
    if (result.chains === 0) return;
    this.events.push({ type: 'cleared', result });
    const attack = this.garbage.offset(result.chunks);
    if (attack.length > 0) this.events.push({ type: 'attack', chunks: attack });
  }

  private lock(): void {
    this.events.push({ type: 'locked' });
    this.reportClear(placeAndResolve(this.board, this.current));
    this.garbage.onPiecePlaced(this.board, this.garbageRng);
    // おじゃまが崩れて偶然6つ繋がったら、その場で消して受けた側の攻撃にする
    this.reportClear(resolve(this.board));
    this.fallTimer = 0;

    this.current = spawnPiece(this.next);
    this.next = this.randomTriple();
    if (this.board.isOverLine() || !canPlace(this.current, this.board)) {
      this.status = 'lost';
      this.events.push({ type: 'lost' });
    }
  }
}
