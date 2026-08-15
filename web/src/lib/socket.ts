import { WS_URL } from './config';
import type { Envelope, ServerMessageType } from './protocol';
import type { Pairing } from './storage';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

type Listener = (env: Envelope) => void;

/**
 * How long we tolerate total silence from the server. The server pings every
 * 25s, so 45s without a single frame means the connection is wedged even
 * though the browser still believes it is open — the classic "walked out of
 * Wi-Fi range" case.
 */
const SILENCE_TIMEOUT_MS = 45_000;

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 15_000;

/**
 * A WebSocket that survives the network dropping.
 *
 * On every (re)connect it joins the stored room and the server replays the
 * canvas, so a reconnect restores state without the app tracking what it
 * missed.
 */
export class AniviSocket {
  private ws: WebSocket | null = null;
  private pairing: Pairing | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private silenceTimer: number | null = null;
  private closedByUs = false;
  private status: ConnectionStatus = 'offline';

  connect(pairing: Pairing): void {
    this.pairing = pairing;
    this.closedByUs = false;
    this.open();
  }

  disconnect(): void {
    this.closedByUs = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.setStatus('offline');
  }

  /** Sends a message, or drops it if the socket is down (state is replayed on reconnect anyway). */
  send(env: Envelope): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(env));
    return true;
  }

  on(type: ServerMessageType, fn: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  onStatus(fn: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Asks the server to replay the room (used when the tab wakes up). */
  requestSync(): void {
    if (!this.send({ type: 'sync' })) this.reconnectNow();
  }

  /** Forces an immediate reconnect, e.g. when the browser reports it is back online. */
  reconnectNow(): void {
    if (this.closedByUs || !this.pairing) return;
    this.clearTimers();
    this.reconnectAttempts = 0;
    this.ws?.close();
    this.open();
  }

  private open(): void {
    if (!this.pairing) return;
    const { roomId, userId, loveCode } = this.pairing;
    // The pairing rides along in the query string so the server can join the
    // room during the upgrade — one less round trip on every reconnect.
    const url = `${WS_URL}?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(
      userId,
    )}&loveCode=${encodeURIComponent(loveCode)}`;

    // Never leave two sockets attached to the same room from one device.
    if (this.ws) {
      const stale = this.ws;
      this.ws = null;
      stale.close();
    }

    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempts = 0;
      this.setStatus('online');
      this.armSilenceTimer(ws);
      // Explicit join as well: harmless if the query string already did it,
      // and it covers a server that ignores the query parameters.
      this.send({ type: 'join', roomId, userId, loveCode });
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      this.armSilenceTimer(ws);
      let env: Envelope;
      try {
        env = JSON.parse(String(event.data)) as Envelope;
      } catch {
        return;
      }
      if (env.type === 'ping') {
        // Browsers cannot answer protocol-level pings, so the server also
        // sends an application ping that we answer here.
        this.send({ type: 'pong', timestamp: Date.now() });
        return;
      }
      this.emit(env);
    };

    ws.onclose = () => {
      // A socket we have already replaced (reconnect, or a remount in dev)
      // must not drag the live one offline or trigger a second connection —
      // that is how one device ends up looking like two partners.
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('offline');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose always follows; reconnecting is handled there.
    };
  }

  private emit(env: Envelope): void {
    for (const fn of this.listeners.get(env.type) ?? []) fn(env);
    for (const fn of this.listeners.get('*' as ServerMessageType) ?? []) fn(env);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const fn of this.statusListeners) fn(status);
  }

  private armSilenceTimer(ws: WebSocket): void {
    if (this.silenceTimer !== null) window.clearTimeout(this.silenceTimer);
    this.silenceTimer = window.setTimeout(() => {
      // The socket looks open but nothing is arriving: tear it down so the
      // normal reconnect path runs. Closing `ws` rather than the current
      // socket keeps a stale timer from killing a healthy connection.
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }, SILENCE_TIMEOUT_MS);
  }

  private scheduleReconnect(): void {
    if (this.closedByUs || !this.pairing || this.reconnectTimer !== null) return;
    const backoff = Math.min(RECONNECT_MIN_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    // Jitter keeps two reconnecting phones from syncing up on the same retry.
    const delay = backoff * (0.7 + Math.random() * 0.6);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
