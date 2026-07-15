import Phaser from 'phaser';
import { worldChat, type ChatEntry } from '../chat';
import { FONT, CHAT_PANEL_WIDTH } from './ui';

const PANEL_W = CHAT_PANEL_WIDTH;

// Message colors by kind: player chatter, world announcements, debug traces.
const KIND_COLORS: Record<ChatEntry['kind'], string> = {
  player: '#e9ecef', // white — real people talking
  system: '#ffd60a', // gold  — world notices (joins, purchases, race results)
  debug: '#4cc9f0',  // cyan  — FlexMatch / infrastructure traces
};

/**
 * Right-side world chat panel. Mount in any lobby scene with
 * `new ChatPanel(this)` — it renders the shared history (color-coded per
 * message kind), live messages, and a DOM input for sending.
 */
export class ChatPanel {
  private scene: Phaser.Scene;
  private lineObjs: Phaser.GameObjects.Text[] = [];
  private listTop: number;
  private listBottom: number;
  private listX: number;
  private unsubscribe: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const w = scene.scale.width, h = scene.scale.height;
    const x = w - PANEL_W;
    // panel fills the framed area only (page frame + divider drawn by pageFrame)
    const top = 12, bottom = h - 12;
    this.listX = x + 12;
    this.listTop = top + 38;
    this.listBottom = bottom - 46;

    scene.add.rectangle(x + PANEL_W / 2, (top + bottom) / 2, PANEL_W - 12, bottom - top, 0x0d0d17, 0.92)
      .setDepth(200);
    scene.add.text(x + PANEL_W / 2, top + 14, '🌍 WORLD CHAT', {
      fontFamily: FONT, fontSize: '14px', color: '#ffd60a',
    }).setOrigin(0.5).setDepth(201);
    // separator under the panel title
    scene.add.rectangle(x + PANEL_W / 2, top + 28, PANEL_W - 32, 1, 0x4a4e69).setDepth(201);

    const input = scene.add.dom(x + PANEL_W / 2 - 2, bottom - 22).createFromHTML(`
      <input id="chat-input" type="text" maxlength="200" placeholder="说点什么..."
        style="width: ${PANEL_W - 44}px; padding: 6px; font-family: monospace; font-size: 12px;
               background: #22223b; color: #fff; border: 1px solid #4a4e69; border-radius: 3px; outline: none;" />
    `).setDepth(202);
    const el = input.getChildByID('chat-input') as HTMLInputElement;
    let lastSendAt = 0;
    el.addEventListener('keydown', (ev) => {
      ev.stopPropagation(); // don't let WASD/space leak into the game
      // IME guard: confirming Chinese input with Enter fires a keydown too
      // (isComposing / legacy keyCode 229) — without this the next real Enter
      // makes the message appear to send twice.
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Enter' && el.value.trim()) {
        const now = Date.now();
        if (now - lastSendAt < 300) return; // debounce duplicate key events
        lastSendAt = now;
        worldChat.say(el.value);
        el.value = '';
      }
    });

    this.redraw();
    this.unsubscribe = worldChat.subscribe(() => this.redraw());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe());
  }

  /**
   * Renders newest-last from the bottom up: each entry is its own Text object
   * (per-kind color), word-wrapped; stops when the panel is full.
   */
  private redraw(): void {
    for (const o of this.lineObjs) o.destroy();
    this.lineObjs = [];

    let y = this.listBottom;
    for (let i = worldChat.history.length - 1; i >= 0 && y > this.listTop; i--) {
      const e = worldChat.history[i];
      const t = this.scene.add.text(this.listX, 0, formatEntry(e), {
        fontFamily: FONT, fontSize: '11px',
        color: KIND_COLORS[e.kind] ?? '#e9ecef',
        wordWrap: { width: PANEL_W - 34 }, lineSpacing: 3,
      }).setDepth(201);
      y -= t.height + 6;
      if (y < this.listTop) { t.destroy(); break; }
      t.setY(y);
      this.lineObjs.push(t);
    }
  }
}

function formatEntry(e: ChatEntry): string {
  const t = new Date(e.at);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  switch (e.kind) {
    case 'debug': return `[${hh}:${mm}] 🔧 ${e.text}`;
    case 'system': return `[${hh}:${mm}] ⚙ ${e.text}`;
    default: return `[${hh}:${mm}] ${e.from}: ${e.text}`;
  }
}
