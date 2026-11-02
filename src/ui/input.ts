import type { Action } from '../core/game';

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'hardDrop',
  ArrowDown: 'softDropOn',
  z: 'rotateL',
  Z: 'rotateL',
  x: 'rotateR',
  X: 'rotateR',
};
// 押しっぱなしの連打を許すのは左右移動だけ
const REPEATABLE = new Set<Action>(['left', 'right']);

export function attachKeyboard(onAction: (a: Action) => void): () => void {
  const down = (e: KeyboardEvent) => {
    const action = KEYMAP[e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat && !REPEATABLE.has(action)) return;
    onAction(action);
  };
  const up = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') onAction('softDropOff');
  };
  // ↓を押したまま別ウィンドウに移ると keyup が来ないので、離れた時点で解除する
  const release = () => onAction('softDropOff');
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', release);
  };
}
