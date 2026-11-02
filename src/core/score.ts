export const WINS_NEEDED = 3;

// 3本先取の勝敗。record にはそのラウンドの勝者（0/1）か 'draw' を渡す。
export class Score {
  wins: [number, number] = [0, 0];

  record(roundWinner: 0 | 1 | 'draw'): void {
    if (roundWinner !== 'draw') this.wins[roundWinner]++;
  }

  winner(): 0 | 1 | null {
    if (this.wins[0] >= WINS_NEEDED) return 0;
    if (this.wins[1] >= WINS_NEEDED) return 1;
    return null;
  }
}
