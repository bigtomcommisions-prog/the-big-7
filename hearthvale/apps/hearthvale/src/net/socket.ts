import type { ClientMessage, ServerMessage } from '@hearthvale/shared';
import { API_ORIGIN } from '../api.ts';

export type ConnState = 'connecting' | 'online' | 'offline';

type Handler = (msg: ServerMessage) => void;

/** Close codes after which reconnecting would be pointless. */
const FATAL = new Set([4001, 4003, 4004]);

/**
 * WebSocket with exponential-backoff reconnect. Auth is the session cookie (same origin).
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private closedByUs = false;
  private retryTimer: number | undefined;
  onMessage: Handler = () => {};
  onState: (s: ConnState, detail?: string) => void = () => {};
  onFatal: (code: number, reason: string) => void = () => {};

  constructor(private guildId: string) {}

  connect() {
    this.closedByUs = false;
    const base = API_ORIGIN
      ? API_ORIGIN.replace(/^http/, 'ws')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    const ws = new WebSocket(`${base}/ws?guild=${encodeURIComponent(this.guildId)}`);
    this.ws = ws;
    this.onState('connecting');
    ws.onopen = () => {
      this.attempts = 0;
      this.onState('online');
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string) as ServerMessage);
      } catch (err) {
        console.error('Bad server message', err);
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUs) return;
      if (FATAL.has(ev.code)) {
        this.onState('offline', ev.reason);
        this.onFatal(ev.code, ev.reason);
        return;
      }
      const delay = Math.min(15_000, 500 * 2 ** this.attempts++) + Math.random() * 400;
      this.onState('connecting', `Reconnecting in ${Math.round(delay / 1000)}s…`);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    this.closedByUs = true;
    clearTimeout(this.retryTimer);
    this.ws?.close(1000, 'bye');
    this.ws = null;
  }
}
