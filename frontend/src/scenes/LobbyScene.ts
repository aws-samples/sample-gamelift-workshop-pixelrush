import Phaser from 'phaser';
import { api, loadArena, type Player } from '../api';
import { warmLatencyProbe } from '../latency';
import { worldChat } from '../chat';
import { audio } from '../audio';
import { clearSession } from '../session';
import { button, statusBar, contentCx, FONT, pageFrame } from './ui';
import { ChatPanel } from './ChatPanel';

// 2x2 menu tiles: generous panels that fill the content area.
const TILE_W = 300, TILE_H = 150, TILE_GAP = 20;

export class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby'); }

  async create(): Promise<void> {
    let player = this.registry.get('player') as Player;
    worldChat.connect(player.playerId);
    new ChatPanel(this);
    pageFrame(this, { chatDivider: true });
    // probe region latencies in the background while the player browses —
    // results are cached and attached to the matchmaking request later
    warmLatencyProbe();

    // refresh profile (coins/unlocks change after races)
    try {
      const res = await api.profile(player.playerId);
      player = res.player;
      this.registry.set('player', player);
    } catch { /* keep cached */ }

    const cx = contentCx(this);
    this.add.text(cx, 86, 'PIXEL RUSH', {
      fontFamily: FONT, fontSize: '42px', color: '#ffd60a', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    const arena = loadArena();
    const arenaLabel = arena.kind === 'aws' ? '☁️ AWS ARENA' : `🔧 ${arena.name ?? 'MY SERVER'}`;
    this.add.text(cx, 122, `— ${arenaLabel} —`, {
      fontFamily: FONT, fontSize: '13px', color: arena.kind === 'aws' ? '#6c757d' : '#80ffdb',
    }).setOrigin(0.5);
    statusBar(this, player);

    const tiles: [string, string, string, string, () => void][] = [
      // [icon, label, hint, accentColor, action]
      ['🏁', 'RACE', 'quick start or multiplayer', '#ffd60a', () => this.scene.start('TrackSelect')],
      ['🚗', 'GARAGE', 'pick your ride', '#80ffdb', () => this.scene.start('Garage')],
      ['🛒', 'SHOP', 'buy new cars', '#f4a261', () => this.scene.start('Shop')],
      ['🏆', 'LEADERBOARD', 'best times per track', '#9b5de5', () => this.scene.start('Leaderboard')],
    ];
    const gridTop = 170;
    tiles.forEach(([icon, label, hint, color, action], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = cx + (col === 0 ? -(TILE_W + TILE_GAP) / 2 : (TILE_W + TILE_GAP) / 2);
      const y = gridTop + TILE_H / 2 + row * (TILE_H + TILE_GAP);
      this.menuTile(x, y, icon, label, hint, color, action);
    });

    button(this, cx, gridTop + 2 * TILE_H + TILE_GAP + 52, 'switch racer', () => {
      clearSession();
      this.registry.remove('player');
      this.scene.start('Login');
    }, { size: 14, color: '#adb5bd' });

    const muteBtn = button(this, 40, this.scale.height - 30, audio.muted ? '🔇' : '🔊', () => {
      const muted = audio.toggleMute();
      muteBtn.setText(muted ? '🔇' : '🔊');
    }, { size: 18 });
  }

  /** Big bordered menu tile: icon + label + hint, hover lift + accent border. */
  private menuTile(x: number, y: number, icon: string, label: string, hint: string, color: string, onClick: () => void): void {
    const tile = this.add.container(x, y);
    const accent = Phaser.Display.Color.HexStringToColor(color).color;
    const bg = this.add.rectangle(0, 0, TILE_W, TILE_H, 0x22223b, 0.92).setStrokeStyle(2, 0x4a4e69);
    tile.add(bg);
    tile.add(this.add.text(0, -34, icon, { fontSize: '38px' }).setOrigin(0.5));
    tile.add(this.add.text(0, 16, label, {
      fontFamily: FONT, fontSize: '22px', color, stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    tile.add(this.add.text(0, 46, hint, {
      fontFamily: FONT, fontSize: '11px', color: '#6c757d',
    }).setOrigin(0.5));

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      bg.setStrokeStyle(3, accent);
      this.tweens.add({ targets: tile, scale: 1.04, duration: 120, ease: 'Quad.out' });
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, 0x4a4e69);
      this.tweens.add({ targets: tile, scale: 1, duration: 120 });
    });
    bg.on('pointerdown', onClick);
  }
}
