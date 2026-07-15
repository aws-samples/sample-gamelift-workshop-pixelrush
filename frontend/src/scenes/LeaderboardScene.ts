import Phaser from 'phaser';
import { api, type Player, type TrackInfo } from '../api';
import { title, button, statusBar, toast, formatMs, contentCx, FONT, pageFrame } from './ui';
import { ChatPanel } from './ChatPanel';

export class LeaderboardScene extends Phaser.Scene {
  private trackIdx = 0;
  private tracks: TrackInfo[] = [];

  constructor() { super('Leaderboard'); }

  async create(): Promise<void> {
    const player = this.registry.get('player') as Player;
    title(this, 'LEADERBOARD');
    statusBar(this, player);
    new ChatPanel(this);
    pageFrame(this, { chatDivider: true });
    button(this, 70, this.scale.height - 36, '< back', () => this.scene.start('Lobby'), { size: 16 });

    try {
      this.tracks = (await api.tracks(player.playerId)).tracks;
    } catch (e) {
      toast(this, (e as Error).message);
      return;
    }
    await this.renderBoard();
  }

  private async renderBoard(): Promise<void> {
    const player = this.registry.get('player') as Player;
    const track = this.tracks[this.trackIdx];
    const cx = contentCx(this);

    // track switcher
    const header = this.add.text(cx, 120, `< ${track.name} >`, {
      fontFamily: FONT, fontSize: '24px', color: '#ffd60a',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    header.on('pointerdown', () => {
      this.trackIdx = (this.trackIdx + 1) % this.tracks.length;
      this.scene.restart();
    });

    try {
      const { entries } = await api.leaderboard(track.trackId);
      if (entries.length === 0) {
        this.add.text(cx, 300, 'No times yet — be the first!', {
          fontFamily: FONT, fontSize: '18px', color: '#adb5bd',
        }).setOrigin(0.5);
        return;
      }
      // left-aligned rows in a fixed column so names/times line up
      const rowX = cx - 240;
      entries.forEach((e, i) => {
        const isMe = e.playerId === player.playerId;
        const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : '  ';
        this.add.text(rowX, 170 + i * 36,
          `${medal} ${String(e.rank).padStart(2)}. ${e.playerName.padEnd(16)} ${formatMs(e.bestTimeMs)}${isMe ? '  << YOU' : ''}`,
          { fontFamily: FONT, fontSize: '18px', color: isMe ? '#80ffdb' : '#ffffff' }).setOrigin(0, 0.5);
      });
    } catch (e) {
      toast(this, (e as Error).message);
    }
  }
}
