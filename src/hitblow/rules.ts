// 6色から4つ並べる。同じ色を何度使ってもよい。
export const CODE_LENGTH = 4;
export const COLOR_COUNT = 6;
export const MAX_TURNS = 10;

export type Code = number[];
export type Result = { hit: number; blow: number };

export function isValidCode(code: unknown): code is Code {
  return (
    Array.isArray(code) &&
    code.length === CODE_LENGTH &&
    code.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < COLOR_COUNT)
  );
}

// マスターマインド方式: ヒットに使った玉はブローに二重に数えない
export function score(secret: Code, guess: Code): Result {
  let hit = 0;
  const restSecret = new Array<number>(COLOR_COUNT).fill(0);
  const restGuess = new Array<number>(COLOR_COUNT).fill(0);
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (secret[i] === guess[i]) hit++;
    else {
      restSecret[secret[i]]++;
      restGuess[guess[i]]++;
    }
  }
  let blow = 0;
  for (let c = 0; c < COLOR_COUNT; c++) blow += Math.min(restSecret[c], restGuess[c]);
  return { hit, blow };
}
