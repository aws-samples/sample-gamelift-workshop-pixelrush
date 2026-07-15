import Phaser from 'phaser';

// Tiny shared UI helpers for the pixel-styled lobby scenes.

export const FONT = 'monospace';

/** Width of the right-side world-chat panel (see ChatPanel.ts). */
export const CHAT_PANEL_WIDTH = 250;

/** Inset of the arcade frame from the viewport edge. */
export const FRAME_INSET = 14;

/** Horizontal center of the content area left of the world-chat panel. */
export function contentCx(scene: Phaser.Scene): number {
  return (scene.scale.width - CHAT_PANEL_WIDTH) / 2;
}

/**
 * Arcade-cabinet outer frame drawn on every screen: dark bezel, gold main
 * line, thin inner line. Scenes with a chat panel get a matching divider so
 * the game area and the chat column read as two aligned framed boxes.
 */
export function pageFrame(scene: Phaser.Scene, opts: { chatDivider?: boolean } = {}): void {
  // depth 300: above the chat panel background (200) so the right edge of
  // the frame stays visible next to the chat column
  const g = scene.add.graphics().setDepth(300);
  const w = scene.scale.width, h = scene.scale.height;
  g.lineStyle(6, 0x0d0d17, 1).strokeRect(3, 3, w - 6, h - 6);
  g.lineStyle(1, 0xffd60a, 0.85).strokeRect(7, 7, w - 14, h - 14);
  g.lineStyle(1, 0x4a4e69, 1).strokeRect(10, 10, w - 20, h - 20);
  if (opts.chatDivider) {
    // vertical divider along the chat panel's left edge, same style family
    const x = w - CHAT_PANEL_WIDTH;
    g.lineStyle(1, 0xffd60a, 0.85).lineBetween(x, 7, x, h - 7);
    g.lineStyle(1, 0x4a4e69, 1).lineBetween(x + 3, 10, x + 3, h - 10);
  }
}

export function title(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text {
  // centered on the content area, below the top-left player status bar
  return scene.add.text(contentCx(scene), 72, text, {
    fontFamily: FONT, fontSize: '32px', color: '#ffd60a', stroke: '#000', strokeThickness: 6,
  }).setOrigin(0.5);
}

export function button(
  scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void,
  opts: { size?: number; color?: string; disabled?: boolean } = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, label, {
    fontFamily: FONT, fontSize: `${opts.size ?? 22}px`,
    color: opts.disabled ? '#6c757d' : opts.color ?? '#80ffdb',
    backgroundColor: '#22223bcc', padding: { x: 14, y: 8 },
  }).setOrigin(0.5);
  if (!opts.disabled) {
    t.setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setStyle({ backgroundColor: '#4a4e69cc' }));
    t.on('pointerout', () => t.setStyle({ backgroundColor: '#22223bcc' }));
    t.on('pointerdown', onClick);
  }
  return t;
}

export function statusBar(scene: Phaser.Scene, player: { name: string; level: number; coins: number; titles: string[] }): void {
  scene.add.text(12, 10,
    `${player.name}  Lv.${player.level}  🟡${player.coins}  「${player.titles[player.titles.length - 1] ?? 'Rookie'}」`,
    { fontFamily: FONT, fontSize: '16px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 8, y: 6 } });
}

export interface CarCardSpec {
  carId: string;
  name: string;
  statLine: string;   // e.g. "speed +8%  ★★★★★"
  subLine?: string;   // description / owned note
  rightLabel?: string; // "OWNED" / price / "[SELECTED]"
  rightColor?: string;
  highlighted?: boolean; // selected/owned accent border
  onClick?: () => void;
}

const CARD_W = 330, CARD_H = 108;
export const CAR_CARD = { W: CARD_W, H: CARD_H };

/**
 * Bordered car card used by Garage and Shop: car icon (nose up, large) on
 * the left, text on the right; hover lifts and brightens; whole card clickable.
 */
export function carCard(scene: Phaser.Scene, x: number, y: number, spec: CarCardSpec): Phaser.GameObjects.Container {
  const card = scene.add.container(x, y);
  const accent = spec.highlighted ? 0x2a9d8f : 0x4a4e69;
  const bg = scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x22223b, 0.92).setStrokeStyle(2, accent);
  card.add(bg);
  card.add(scene.add.sprite(-CARD_W / 2 + 46, 0, `car-${spec.carId}`)
    .setDisplaySize(58, 87)); // nose up, matches the race orientation
  card.add(scene.add.text(-CARD_W / 2 + 92, -34, spec.name, {
    fontFamily: FONT, fontSize: '15px', color: '#ffffff',
  }));
  card.add(scene.add.text(-CARD_W / 2 + 92, -10, spec.statLine, {
    fontFamily: FONT, fontSize: '11px', color: '#adb5bd',
  }));
  if (spec.subLine) {
    card.add(scene.add.text(-CARD_W / 2 + 92, 10, spec.subLine, {
      fontFamily: FONT, fontSize: '10px', color: '#6c757d',
      wordWrap: { width: CARD_W - 110 },
    }));
  }
  if (spec.rightLabel) {
    card.add(scene.add.text(CARD_W / 2 - 14, -34, spec.rightLabel, {
      fontFamily: FONT, fontSize: '13px', color: spec.rightColor ?? '#ffd60a',
    }).setOrigin(1, 0.5));
  }
  if (spec.onClick) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      bg.setStrokeStyle(3, 0x80ffdb);
      scene.tweens.add({ targets: card, scale: 1.03, duration: 110, ease: 'Quad.out' });
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, accent);
      scene.tweens.add({ targets: card, scale: 1, duration: 110 });
    });
    bg.on('pointerdown', spec.onClick);
  }
  return card;
}

export function toast(scene: Phaser.Scene, message: string, color = '#ff6b6b'): void {
  const t = scene.add.text(scene.scale.width / 2, scene.scale.height - 40, message, {
    fontFamily: FONT, fontSize: '18px', color, stroke: '#000', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(200);
  scene.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => t.destroy() });
}

export function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
