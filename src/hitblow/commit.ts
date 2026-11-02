import type { Entry } from './match';
import { type Code, isValidCode, score } from './rules';

// 正解は相手に渡さず、試合前に「封印値」（正解＋塩のハッシュ）だけを送る。
// 試合後に正解と塩を公開し、封印値と過去の判定がすべて合うか確かめる。

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function randomSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function commit(secret: Code, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${secret.join(',')}`);
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

// entries は「相手の正解に対して自分が出した推測」と、相手が返した判定
export async function verifyReveal(commitment: string, secret: unknown, salt: string, entries: Entry[]): Promise<boolean> {
  if (!isValidCode(secret)) return false;
  if ((await commit(secret, salt)) !== commitment) return false;
  return entries.every(({ guess, result }) => {
    const r = score(secret, guess);
    return r.hit === result.hit && r.blow === result.blow;
  });
}
