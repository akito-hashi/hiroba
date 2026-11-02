import type { TableLink } from '../plaza/client';
import type { GameId } from '../plaza/state';

export type CpuLevel = 'weak' | 'normal' | 'strong';

// 二人用のゲームが使う、相手1人との送受信口
export type PeerLink = {
  send(m: unknown): void;
  onMessage(handler: (m: unknown) => void): () => void;
};

// 卓の送受信口から、二人用（席0と席1）の相手との送受信口を作る
export function pairLink(link: TableLink, seat: number): PeerLink {
  const other = seat === 0 ? 1 : 0;
  return {
    send: (m) => link.send(other, m),
    onMessage: (h) => link.onMessage((from, m) => from === other && h(m)),
  };
}

export type PlayMode =
  | { kind: 'practice' }
  | { kind: 'cpu'; level: CpuLevel }
  // 卓での対戦。seat は卓の中の席（0 が卓の主）、names は席順の名前
  | { kind: 'online'; seat: number; names: string[]; link: TableLink };

export type GameContext = {
  root: HTMLElement;
  mode: PlayMode;
  // 「戻る」が押されたとき。卓での対戦なら、卓のほかの人には抜けたと伝わる。
  onBack(): void;
};

export type GameInstance = {
  // 卓での対戦で、ある席の人がゲームから抜けた（戻った・切断した）
  playerLeft(seat: number): void;
  dispose(): void;
};

export type GameModule = {
  id: GameId;
  title: string;
  description: string;
  hasPractice: boolean;
  mount(ctx: GameContext): GameInstance;
};
