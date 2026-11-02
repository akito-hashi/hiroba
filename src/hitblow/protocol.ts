import { CODE_LENGTH, type Code, isValidCode } from './rules';

export type HbMsg =
  | { t: 'ready'; commitment: string }
  | { t: 'guess'; code: Code }
  | { t: 'result'; hit: number; blow: number }
  | { t: 'reveal'; secret: Code; salt: string };

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isHex = (v: unknown, len: number) => typeof v === 'string' && v.length === len && /^[0-9a-f]+$/.test(v);

// 相手から来たデータは信用せず、形を確かめてから使う
export function decodeHb(data: unknown): HbMsg | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case 'ready':
      return isHex(m.commitment, 64) ? { t: 'ready', commitment: m.commitment as string } : null;
    case 'guess':
      return isValidCode(m.code) ? { t: 'guess', code: [...m.code] } : null;
    case 'result': {
      const { hit, blow } = m;
      if (!isCount(hit) || !isCount(blow) || hit + blow > CODE_LENGTH) return null;
      // 3つ当たっていれば残り1つは位置違いになりようがない
      if (hit === CODE_LENGTH - 1 && blow === 1) return null;
      return { t: 'result', hit, blow };
    }
    case 'reveal':
      return isValidCode(m.secret) && isHex(m.salt, 32) ? { t: 'reveal', secret: [...m.secret], salt: m.salt as string } : null;
    default:
      return null;
  }
}
