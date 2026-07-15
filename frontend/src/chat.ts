// World chat + matchmaking notification socket. One persistent WebSocket per
// session: chat frames flow both ways; matchmaking pushes arrive on the same
// connection (routed by message `type`).

import { getNotifyUrl } from './api';

export interface MatchSuccess {
  ipAddress: string;
  dnsName: string;
  port: number;
  playerSessionId: string;
}

export interface ChatEntry {
  kind: 'system' | 'player' | 'debug';
  from?: string;
  text: string;
  at: number;
}

type ChatListener = (entry: ChatEntry) => void;

class WorldChat {
  private sock?: WebSocket;
  private playerId = '';
  private listeners = new Set<ChatListener>();
  private helloSent = false;
  private reconnectTimer?: number;
  readonly history: ChatEntry[] = [];

  // matchmaking pushes ride the same socket
  onMatchStatus?: (status: string) => void;
  onMatchSuccess?: (conn: MatchSuccess) => void;
  onMatchFailed?: (status: string) => void;

  get connected(): boolean { return this.sock?.readyState === WebSocket.OPEN; }

  connect(playerId: string): void {
    // one socket per session: also treat CONNECTING as alive, and silence the
    // old socket's onclose before replacing it (its close event would
    // otherwise trigger a reconnect and leave TWO sockets printing every
    // broadcast — the "duplicate chat messages" bug)
    if (this.sock && this.playerId === playerId &&
        (this.sock.readyState === WebSocket.OPEN || this.sock.readyState === WebSocket.CONNECTING)) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    if (this.sock) {
      this.sock.onclose = null;
      this.sock.onmessage = null;
      this.sock.close();
    }
    if (this.playerId !== playerId) this.helloSent = false;
    this.playerId = playerId;
    const url = getNotifyUrl();
    if (!url) return;
    this.sock = new WebSocket(`${url}?playerId=${encodeURIComponent(playerId)}`);
    this.sock.onopen = () => {
      // announce "<name> joined the game" only once per login, not per reconnect
      if (!this.helloSent) {
        this.helloSent = true;
        this.sock!.send(JSON.stringify({ type: 'hello', playerId }));
      }
    };
    this.sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string);
      if (m.type === 'chat') {
        const entry: ChatEntry = { kind: m.kind, from: m.from, text: m.text, at: m.at };
        this.history.push(entry);
        if (this.history.length > 100) this.history.shift();
        for (const l of this.listeners) l(entry);
      } else if (m.type === 'matchmaking') {
        switch (m.status) {
          case 'MatchmakingSucceeded':
            this.onMatchSuccess?.({
              ipAddress: m.ipAddress, dnsName: m.dnsName,
              port: m.port, playerSessionId: m.playerSessionId,
            });
            break;
          case 'MatchmakingFailed':
          case 'MatchmakingTimedOut':
          case 'MatchmakingCancelled':
            this.onMatchFailed?.(m.status);
            break;
          default:
            this.onMatchStatus?.(m.status);
        }
      }
    };
    this.sock.onclose = () => {
      // auto-reconnect while the tab lives (chat is a lobby fixture)
      this.reconnectTimer = window.setTimeout(() => {
        if (this.playerId) this.connect(this.playerId);
      }, 3000);
    };
  }

  private lastSay = '';
  private lastSayAt = 0;

  say(text: string): void {
    const t = text.trim();
    if (!this.connected || !t) return;
    // final dedupe layer: identical text within 1.5s is a double-fire
    // (IME Enter echo, double-mounted panel), not a real repeat
    const now = Date.now();
    if (t === this.lastSay && now - this.lastSayAt < 1500) return;
    this.lastSay = t;
    this.lastSayAt = now;
    this.sock!.send(JSON.stringify({ type: 'say', playerId: this.playerId, text: t }));
  }

  subscribe(l: ChatListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const worldChat = new WorldChat();
