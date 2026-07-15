import Phaser from 'phaser';
import { api, initConfig } from '../api';
import { loadSession, clearSession } from '../session';

// Car palette per slot (player cars) — bright, distinct pixel colors.
export const SLOT_COLORS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x9b5de5, 0x00b4d8, 0xffd166, 0xef476f, 0x8ac926];
const NPC_COLOR = 0x8d99ae;

// Catalog car colors (garage/shop preview sprites), keyed by carId.
// Distinct pixel tints per class: white sedan, blue compact, navy coupe,
// silver roadster, red GT, scarlet + green supercars, dark-blue hypercar.
export const CAR_COLORS: Record<string, number> = {
  'sedan-white': 0xe9ecef, 'compact-blue': 0x4d96ff, 'coupe-navy': 0x1d3557,
  'roadster-silver': 0xadb5bd, 'sports-red': 0xd62828, 'supercar-red': 0xe63946,
  'supercar-green': 0x70e000, 'hypercar-darkblue': 0x14213d,
};

/**
 * Generates all textures procedurally (pixel-art style cars, item box, bomb)
 * so Phase 1 needs no binary assets. A hand-drawn sprite pass replaces these
 * in the polish phase.
 */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    // Hand-drawn car sprites: 32x48 top-down PNGs (car nose UP) live in
    // frontend/public/cars/<carId>.png and replace the procedural rectangles
    // automatically (missing files fall back silently).
    for (const carId of Object.keys(CAR_COLORS)) {
      this.load.image(`car-png-${carId}`, `/cars/${carId}.png`);
    }
    this.load.image('car-png-npc', '/cars/npc.png');
    // ignore 404s: loader errors are non-fatal, fallback handles them
    this.load.on('loaderror', () => { /* procedural fallback below */ });
  }

  create(): void {
    for (let i = 0; i < SLOT_COLORS.length; i++) {
      this.makeCarTexture(`car-slot-${i}`, SLOT_COLORS[i]);
    }
    this.makeCarTexture('car-npc', NPC_COLOR);
    for (const [carId, color] of Object.entries(CAR_COLORS)) {
      this.makeCarTexture(`car-${carId}`, color);
    }
    // hand-drawn sprites override the procedural textures where present
    for (const carId of Object.keys(CAR_COLORS)) {
      if (this.textures.exists(`car-png-${carId}`)) {
        this.textures.remove(`car-${carId}`);
        this.textures.renameTexture(`car-png-${carId}`, `car-${carId}`);
      }
    }
    if (this.textures.exists('car-png-npc')) {
      this.textures.remove('car-npc');
      this.textures.renameTexture('car-png-npc', 'car-npc');
    }
    this.makeItemBoxTexture();
    this.makeFlameTexture();
    this.makeBombTexture();
    this.makeBarrierTexture();

    // ?server=ws://... skips the lobby and dives straight into a race — // nosemgrep: detect-insecure-websocket
    // used for local dev against `--no-gamelift` and by the browser test.
    const params = new URLSearchParams(location.search);
    const direct = params.get('server');
    if (direct) {
      this.scene.start('Race', {
        serverUrl: direct,
        playerSessionId: params.get('psid') ?? `local-${Math.random().toString(36).slice(2, 8)}`,
        playerId: params.get('pid') ?? `player-${Math.random().toString(36).slice(2, 8)}`,
        playerName: params.get('name') ?? `Racer${Math.floor(Math.random() * 100)}`,
        carId: params.get('car') ?? 'sedan-white',
        trackId: params.get('track') ?? 'track-1',
      });
      return;
    }
    void this.resumeOrLogin();
  }

  /** Returning players (session cookie) skip the login screen. */
  private async resumeOrLogin(): Promise<void> {
    const session = loadSession();
    if (session) {
      try {
        await initConfig();
        const res = await api.profile(session.playerId);
        this.registry.set('player', res.player);
        this.scene.start('Lobby');
        return;
      } catch {
        clearSession(); // player gone (e.g. tables reseeded): fresh login
      }
    }
    this.scene.start('Login');
  }

  /** 16x24 pixel car pointing up (rotated by heading+PI/2 at render time). */
  private makeCarTexture(key: string, color: number): void {
    const g = this.add.graphics();
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(30).color;
    // body
    g.fillStyle(color).fillRect(3, 2, 10, 20);
    // nose taper
    g.fillStyle(dark).fillRect(4, 0, 8, 3);
    // windshield
    g.fillStyle(0x22223b).fillRect(4, 7, 8, 4);
    // wheels
    g.fillStyle(0x111111);
    g.fillRect(1, 4, 2, 5); g.fillRect(13, 4, 2, 5);
    g.fillRect(1, 15, 2, 5); g.fillRect(13, 15, 2, 5);
    g.generateTexture(key, 16, 24);
    g.destroy();
  }

  private makeBarrierTexture(): void {
    const g = this.add.graphics();
    // striped roadblock barrier
    g.fillStyle(0xd62828).fillRect(0, 4, 48, 16);
    g.fillStyle(0xffffff);
    for (let i = 0; i < 3; i++) g.fillRect(6 + i * 16, 4, 8, 16);
    g.fillStyle(0x6c757d);
    g.fillRect(4, 0, 4, 24); g.fillRect(40, 0, 4, 24);
    g.generateTexture('barrier', 48, 24);
    g.destroy();
  }

  private makeItemBoxTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffd60a).fillRect(0, 0, 16, 16);
    g.fillStyle(0xff9e00).fillRect(2, 2, 12, 12);
    g.fillStyle(0xfff3b0);
    g.fillRect(7, 3, 2, 10); g.fillRect(3, 7, 10, 2);
    g.generateTexture('item-box', 16, 16);
    g.destroy();
  }

  private makeBombTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0x212529).fillCircle(9, 11, 7);
    g.fillStyle(0x495057).fillCircle(7, 9, 2); // highlight
    g.fillStyle(0x6c757d).fillRect(8, 1, 3, 4); // fuse stem
    g.fillStyle(0xff5714).fillRect(7, 0, 5, 2); // spark
    g.generateTexture('bomb', 18, 18);
    g.destroy();
  }

  private makeFlameTexture(): void {
    const g = this.add.graphics();
    // pixel exhaust flame: orange core, yellow center
    g.fillStyle(0xff5714).fillTriangle(2, 0, 12, 0, 7, 14);
    g.fillStyle(0xffd60a).fillTriangle(4, 0, 10, 0, 7, 9);
    g.generateTexture('flame', 14, 14);
    g.destroy();
  }
}
