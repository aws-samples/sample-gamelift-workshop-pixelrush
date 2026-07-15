import Phaser from 'phaser';
import { api, type Player, type TrackInfo } from '../api';
import { title, button, statusBar, toast, contentCx, FONT, pageFrame } from './ui';
import { ChatPanel } from './ChatPanel';

// Portrait track cards side by side, one column per track.
const CARD_W = 150;
const CARD_H = 300;
const CARD_GAP = 16;
const TRACK_ICONS = ['🌤', '⚓', '🌃', '🌋'];
// mini road preview colors per track (matches race THEMES)
const CARD_THEMES = [
  { ground: 0x2d6a4f, road: 0x3d405b },
  { ground: 0x1d4e6b, road: 0x40495a },
  { ground: 0x10002b, road: 0x2c096c },
  { ground: 0x6f1d1b, road: 0x2b2118 },
];

export class TrackSelectScene extends Phaser.Scene {
  private cards: Phaser.GameObjects.Container[] = [];
  private selected = -1;
  private tracks: TrackInfo[] = [];
  private modeBar?: Phaser.GameObjects.Container;

  constructor() { super('TrackSelect'); }

  async create(): Promise<void> {
    const player = this.registry.get('player') as Player;
    title(this, 'SELECT TRACK');
    statusBar(this, player);
    new ChatPanel(this);
    pageFrame(this, { chatDivider: true });
    button(this, 70, this.scale.height - 36, '< back', () => this.scene.start('Lobby'), { size: 16 });

    this.cards = [];
    this.selected = -1;
    try {
      this.tracks = (await api.tracks(player.playerId)).tracks;
    } catch (e) {
      toast(this, (e as Error).message);
      return;
    }

    const cx = contentCx(this);
    const total = this.tracks.length * CARD_W + (this.tracks.length - 1) * CARD_GAP;
    const startX = cx - total / 2 + CARD_W / 2;
    const cardY = 270;

    this.tracks.forEach((t, i) => {
      const x = startX + i * (CARD_W + CARD_GAP);
      const card = this.add.container(x, cardY);
      const theme = CARD_THEMES[i] ?? CARD_THEMES[0];

      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x22223b, t.unlocked ? 0.95 : 0.4)
        .setStrokeStyle(2, t.completed ? 0x2a9d8f : t.unlocked ? 0x4a4e69 : 0x343a40);
      card.add(bg);

      // mini vertical road preview at the top of the card
      const pv = this.add.graphics();
      pv.fillStyle(theme.ground).fillRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, 96);
      pv.fillStyle(theme.road).fillRect(-24, -CARD_H / 2 + 8, 48, 96);
      pv.fillStyle(0xffffff, 0.5);
      for (let k = 0; k < 4; k++) pv.fillRect(-2, -CARD_H / 2 + 14 + k * 24, 4, 12);
      if (!t.unlocked) pv.setAlpha(0.35);
      card.add(pv);

      card.add(this.add.text(0, -32, TRACK_ICONS[i] ?? '🏁', { fontSize: '30px' }).setOrigin(0.5));
      card.add(this.add.text(0, 8, t.name, {
        fontFamily: FONT, fontSize: '15px', color: t.unlocked ? '#ffffff' : '#6c757d',
        align: 'center', wordWrap: { width: CARD_W - 16 },
      }).setOrigin(0.5, 0));
      card.add(this.add.text(0, 56, '🔥'.repeat(t.difficulty), { fontSize: '14px' }).setOrigin(0.5));
      if (t.completed) {
        card.add(this.add.text(0, 82, '✅ completed', {
          fontFamily: FONT, fontSize: '11px', color: '#2a9d8f',
        }).setOrigin(0.5));
      }
      if (t.unlocked) {
        card.add(this.add.text(0, CARD_H / 2 - 26, 'SELECT', {
          fontFamily: FONT, fontSize: '13px', color: '#ffd60a',
        }).setOrigin(0.5));
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => { if (this.selected !== i) this.hoverCard(card, true); });
        bg.on('pointerout', () => { if (this.selected !== i) this.hoverCard(card, false); });
        bg.on('pointerdown', () => this.selectCard(i));
      } else {
        card.add(this.add.text(0, CARD_H / 2 - 40, '🔒', { fontSize: '22px' }).setOrigin(0.5));
        const req = this.tracks.find((x) => x.trackId === t.requiresTrackId)?.name ?? '';
        card.add(this.add.text(0, CARD_H / 2 - 16, `finish ${req}`, {
          fontFamily: FONT, fontSize: '9px', color: '#6c757d',
          align: 'center', wordWrap: { width: CARD_W - 12 },
        }).setOrigin(0.5));
      }
      this.cards.push(card);
    });
  }

  /** Hover: lift the card and brighten its border. */
  private hoverCard(card: Phaser.GameObjects.Container, on: boolean): void {
    const bg = card.list[0] as Phaser.GameObjects.Rectangle;
    bg.setStrokeStyle(on ? 3 : 2, on ? 0x80ffdb : 0x4a4e69);
    this.tweens.add({
      targets: card,
      scale: on ? 1.05 : 1,
      y: on ? 258 : 270,
      duration: 130, ease: 'Quad.out',
    });
  }

  /** Select: gold border + zoom, dim the others, show the mode bar. */
  private selectCard(i: number): void {
    this.selected = i;
    this.cards.forEach((card, j) => {
      const bg = card.list[0] as Phaser.GameObjects.Rectangle;
      if (j === i) {
        this.tweens.add({ targets: card, scale: 1.1, y: 252, alpha: 1, duration: 180, ease: 'Back.out' });
        bg.setStrokeStyle(4, 0xffd60a);
        card.setDepth(10);
      } else {
        this.tweens.add({ targets: card, scale: 1, y: 270, alpha: this.tracks[j].unlocked ? 0.45 : 0.25, duration: 180 });
        bg.setStrokeStyle(2, 0x4a4e69);
        card.setDepth(0);
      }
    });
    this.showModeBar(this.tracks[i].trackId);
  }

  /** Bottom bar: Quick Start or 2/4/8-player multiplayer for the picked track. */
  private showModeBar(trackId: string): void {
    this.modeBar?.destroy();
    const cx = contentCx(this), y = this.scale.height - 90;
    const bar = this.add.container(0, 0).setDepth(20).setAlpha(0);
    bar.add(this.add.rectangle(cx, y, 640, 56, 0x0d0d17, 0.95).setStrokeStyle(2, 0xffd60a));

    const player = this.registry.get('player') as Player;
    const quickStart = () => this.scene.start('Race', {
      local: true, serverUrl: '', playerSessionId: '',
      playerId: player.playerId, playerName: player.name,
      carId: player.selectedCar, trackId,
    });
    const go = (matchSize: number) => this.scene.start('Matchmaking', { trackId, matchSize });

    bar.add(button(this, cx - 200, y, '⚡ QUICK START', quickStart, { size: 16, color: '#80ffdb' }));
    bar.add(this.add.text(cx - 30, y, 'MULTI:', { fontFamily: FONT, fontSize: '13px', color: '#adb5bd' }).setOrigin(0.5));
    bar.add(button(this, cx + 50, y, '2P', () => go(2), { size: 16 }));
    bar.add(button(this, cx + 130, y, '3P', () => go(3), { size: 16 }));
    bar.add(button(this, cx + 210, y, '4P', () => go(4), { size: 16 }));
    this.tweens.add({ targets: bar, alpha: 1, duration: 200 });
    this.modeBar = bar;
  }
}
