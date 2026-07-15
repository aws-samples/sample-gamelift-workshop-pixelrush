import Phaser from 'phaser';
import { api, type Player } from '../api';
import { worldChat, type MatchSuccess } from '../chat';
import { getLatencies } from '../latency';
import { title, button, toast, contentCx, FONT, pageFrame } from './ui';
import { ChatPanel } from './ChatPanel';

/**
 * FlexMatch flow: matchmaking status/success arrive on the persistent
 * world-chat WebSocket (same API Gateway connection). Quick Start (size 1)
 * matches instantly; multiplayer sizes wait for 2/4/8 racers.
 *
 * Local-dev shortcut: ?gs=ws://localhost:1935/ skips matchmaking entirely.
 */
export class MatchmakingScene extends Phaser.Scene {
  private trackId!: string;
  private matchSize = 1;
  private dots = 0;
  private status!: Phaser.GameObjects.Text;
  private pollTimer?: Phaser.Time.TimerEvent;
  private ticketId?: string;
  private started = false;

  constructor() { super('Matchmaking'); }

  init(data: { trackId: string; matchSize?: number }): void {
    this.trackId = data.trackId;
    this.matchSize = data.matchSize ?? 1;
    this.started = false;
    this.ticketId = undefined;
  }

  create(): void {
    const player = this.registry.get('player') as Player;
    title(this, this.matchSize === 1 ? 'QUICK START' : `MATCHMAKING ${this.matchSize}P`);
    new ChatPanel(this);
    pageFrame(this, { chatDivider: true });
    this.status = this.add.text(contentCx(this), 280, this.matchSize === 1 ? 'Starting race' : 'Looking for racers', {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff',
    }).setOrigin(0.5);
    this.time.addEvent({
      delay: 400, loop: true,
      callback: () => {
        this.dots = (this.dots + 1) % 4;
        const base = this.status.text.replace(/\.*$/, '');
        this.status.setText(base + '.'.repeat(this.dots));
      },
    });
    button(this, contentCx(this), 400, 'cancel', () => this.cleanupAnd('Lobby'), { size: 16 });

    const direct = new URLSearchParams(location.search).get('gs');
    if (direct) {
      this.time.delayedCall(600, () => this.startRace({
        ipAddress: '', dnsName: '', port: 0, playerSessionId: `local-${player.playerId}`,
      }, direct));
      return;
    }
    void this.runFlexMatch(player);
  }

  private async runFlexMatch(player: Player): Promise<void> {
    worldChat.connect(player.playerId);
    worldChat.onMatchStatus = (s) => this.status.setText(statusLabel(s));
    worldChat.onMatchSuccess = (conn) => this.startRace(conn);
    worldChat.onMatchFailed = (s) => {
      this.status.setText(`Matchmaking ${s.replace('Matchmaking', '').toLowerCase()} — try again`);
    };
    try {
      // cached from the lobby warm-up; a cold call resolves in <1s (parallel)
      const latencies = await getLatencies().catch(() => undefined);
      const { ticketId, connection } = await api.requestMatchmaking(player.playerId, this.trackId, this.matchSize, latencies);
      this.ticketId = ticketId;

      // Module 4 open placement: the backend already seated us and returned the
      // connection — jump straight into the race, no polling / SNS push needed.
      if (connection) { this.startRace(connection); return; }

      // Poll as a safety net every 5s in case the push is missed.
      this.pollTimer = this.time.addEvent({
        delay: 5000, loop: true,
        callback: async () => {
          if (!this.ticketId || this.started) return;
          try {
            const res = await api.matchStatus(this.ticketId);
            if (res.connection) this.startRace(res.connection);
            else if (res.status.includes('Failed') || res.status.includes('TimedOut')) {
              this.status.setText('Matchmaking timed out — try again');
            }
          } catch { /* transient */ }
        },
      });
    } catch (e) {
      toast(this, (e as Error).message);
      this.status.setText('Matchmaking unavailable');
    }
  }

  private startRace(conn: MatchSuccess, directUrl?: string): void {
    if (this.started) return;
    this.started = true;
    this.clearHandlers();

    const player = this.registry.get('player') as Player;
    // Page over HTTPS -> wss:// against the fleet's TLS cert (DnsName).
    // Exception: 127.0.0.1/localhost (Anywhere on this machine) is a
    // trustworthy origin, so browsers allow plain ws:// even from HTTPS. // nosemgrep: detect-insecure-websocket
    let serverUrl = directUrl;
    if (!serverUrl) {
      const local = conn.ipAddress === '127.0.0.1' || conn.ipAddress === 'localhost';
      const secure = location.protocol === 'https:' && !local;
      const host = secure && conn.dnsName ? conn.dnsName : conn.ipAddress;
      serverUrl = `${secure ? 'wss' : 'ws'}://${host}:${conn.port}/`;
    }
    this.scene.start('Race', {
      serverUrl,
      playerSessionId: conn.playerSessionId,
      playerId: player.playerId,
      playerName: player.name,
      carId: player.selectedCar,
      trackId: this.trackId,
    });
  }

  private clearHandlers(): void {
    worldChat.onMatchStatus = undefined;
    worldChat.onMatchSuccess = undefined;
    worldChat.onMatchFailed = undefined;
    this.pollTimer?.remove();
  }

  private cleanupAnd(scene: string): void {
    this.clearHandlers();
    this.scene.start(scene);
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'MatchmakingSearching': return 'Looking for racers';
    case 'PotentialMatchCreated': return 'Match found! Placing session';
    default: return s;
  }
}
