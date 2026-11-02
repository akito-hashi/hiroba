import { COLS, DANGER_ROW, ROWS, type Cell, inBounds, rowWidth, supports } from './grid';

export type Color = 'red' | 'blue' | 'orange' | 'green' | 'purple' | 'yellow';
export const BALL_COLORS: Color[] = ['red', 'blue', 'orange', 'green', 'purple', 'yellow'];

export class Board {
  private cells: (Color | null)[];

  constructor(cells?: (Color | null)[]) {
    this.cells = cells ? [...cells] : new Array(ROWS * COLS).fill(null);
  }

  get(cell: Cell): Color | null {
    if (!inBounds(cell)) return null;
    return this.cells[cell.r * COLS + cell.c];
  }

  set(cell: Cell, color: Color | null): void {
    if (!inBounds(cell)) throw new Error(`out of bounds: ${cell.c},${cell.r}`);
    this.cells[cell.r * COLS + cell.c] = color;
  }

  isEmpty(cell: Cell): boolean {
    return inBounds(cell) && this.get(cell) === null;
  }

  clone(): Board {
    return new Board(this.cells);
  }

  toArray(): (Color | null)[] {
    return [...this.cells];
  }

  *filled(): Generator<Cell> {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < rowWidth(r); c++) {
        if (this.get({ c, r }) !== null) yield { c, r };
      }
    }
  }

  count(): number {
    return [...this.filled()].length;
  }

  // 支えのないボールを止まるまで落とす。下の段から順に処理する。
  settle(): void {
    for (let r = 1; r < ROWS; r++) {
      for (let c = 0; c < rowWidth(r); c++) {
        const color = this.get({ c, r });
        if (color === null) continue;
        let pos: Cell = { c, r };
        let next = this.nextPosition(pos);
        while (next) {
          this.set(pos, null);
          this.set(next, color);
          pos = next;
          next = this.nextPosition(pos);
        }
      }
    }
  }

  // 次に移動する先。止まるなら null。
  private nextPosition(pos: Cell): Cell | null {
    const sup = supports(pos);
    if (sup.length === 0) return null;
    const empty = sup.filter((s): s is Cell => s !== 'wall' && this.isEmpty(s));
    if (empty.length === 0) return null;
    if (empty.length === 1) return empty[0];
    const below = { c: pos.c, r: pos.r - 2 };
    return this.isEmpty(below) ? below : empty[0];
  }

  isOverLine(): boolean {
    for (let r = DANGER_ROW; r < ROWS; r++) {
      for (let c = 0; c < rowWidth(r); c++) {
        if (this.get({ c, r }) !== null) return true;
      }
    }
    return false;
  }
}
