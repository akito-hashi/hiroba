import Peer, { type DataConnection } from 'peerjs';

// 送るメッセージの型。受け取る側の型（ConnectionHandlers の M）とは別に決める。
export type Connection<Out = unknown> = {
  send(msg: Out): void;
  close(): void;
};

export type ConnectionHandlers<M> = {
  decode(data: unknown): M | null;
  onMessage(msg: M): void;
  onClose(): void;
};

const PING = { t: 'ping' };
const isPing = (data: unknown) => typeof data === 'object' && data !== null && (data as { t?: unknown }).t === 'ping';

const PING_INTERVAL_MS = 1000;
// この時間なにも届かなければ切断とみなす
const SILENCE_LIMIT_MS = 5000;

export type PeerOptions = {
  // ターン制のゲームでは、スマホでアプリを切り替えた程度で切断扱いにしないよう長めにする
  silenceLimitMs?: number;
};
const CONNECT_TIMEOUT_MS = 10000;

// afterClose: 切れたあとの後片付け（1対1なら Peer ごと閉じる。親の広場では閉じない）
function wrap<M>(conn: DataConnection, handlers: ConnectionHandlers<M>, options: PeerOptions, afterClose: () => void): Connection {
  const silenceLimit = options.silenceLimitMs ?? SILENCE_LIMIT_MS;
  let closed = false;
  let lastSeen = Date.now();
  const heartbeat = window.setInterval(() => {
    if (Date.now() - lastSeen > silenceLimit) close();
    else if (conn.open) conn.send(PING);
  }, PING_INTERVAL_MS);
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    handlers.onClose();
    conn.close();
    afterClose();
  }
  conn.on('data', (data) => {
    lastSeen = Date.now();
    if (isPing(data)) return;
    const msg = handlers.decode(data);
    if (msg) handlers.onMessage(msg);
  });
  conn.on('close', close);
  conn.on('error', close);
  // 'disconnected' は仲介サーバーとの接続が切れただけで、相手とのデータ通信は続くので扱わない
  return {
    send: (msg) => {
      if (conn.open) conn.send(msg);
    },
    close,
  };
}

// 広場を作る（親）。ID が決まったら onRoom。子がつながるたびに onConnected で受け口を作る。
// 子の数の上限は広場側（Hub）で判定する。
export function hostHub<M>(
  onRoom: (roomId: string) => void,
  onConnected: (id: string) => ConnectionHandlers<M> & { ready(conn: Connection): void },
  onError: (message: string) => void,
  options: PeerOptions = {},
): () => void {
  const peer = new Peer();
  let opened = false;
  peer.on('open', (id) => {
    opened = true;
    onRoom(id);
  });
  peer.on('error', (e) => {
    // つながった後の個々の接続のエラーは、その接続の切断として扱う
    if (!opened) onError(String(e.type ?? e));
  });
  peer.on('connection', (dc) => {
    dc.on('open', () => {
      const h = onConnected(dc.connectionId);
      h.ready(wrap(dc, h, options, () => {}));
    });
  });
  return () => peer.destroy();
}

export function joinRoom<M>(
  roomId: string,
  handlers: ConnectionHandlers<M>,
  onConnected: (conn: Connection) => void,
  onError: (message: string) => void,
  options: PeerOptions = {},
): () => void {
  const peer = new Peer();
  let connected = false;
  const fail = (message: string) => {
    if (connected) return;
    connected = true; // 2回目以降のエラー表示を防ぐ
    clearTimeout(timer);
    onError(message);
    peer.destroy();
  };
  const timer = window.setTimeout(() => fail('timeout'), CONNECT_TIMEOUT_MS);
  peer.on('error', (e) => fail(String(e.type ?? e)));
  peer.on('open', () => {
    const dc = peer.connect(roomId, { reliable: true });
    // 直接つながらない環境ではここで error / close が来る
    dc.on('error', () => fail('connection'));
    dc.on('close', () => fail('closed'));
    dc.on('open', () => {
      if (connected) return;
      connected = true;
      clearTimeout(timer);
      onConnected(wrap(dc, handlers, options, () => peer.destroy()));
    });
  });
  return () => {
    clearTimeout(timer);
    peer.destroy();
  };
}
