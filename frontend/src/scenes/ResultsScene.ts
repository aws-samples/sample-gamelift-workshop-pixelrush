import Phaser from 'phaser';
import { api, type Player } from '../api';
import type { ResultsParams } from './RaceScene';
import { FONT, pageFrame } from './ui';

export class ResultsScene extends Phaser.Scene {
  constructor() { super('Results'); }

  create(data: ResultsParams): void {
    pageFrame(this);
    const cx = this.scale.width / 2;
    const heading = this.add.text(cx, 60, 'RACE RESULTS', {
      fontFamily: FONT, fontSize: '40px', color: '#ffd60a', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: heading, scale: 1, alpha: 1, duration: 350, ease: 'Back.out' });

    // rows slide in one by one, left-aligned in a fixed column
    const rowX = cx - 280;
    data.standings.forEach((s, i) => {
      const isMe = s.slot === data.mySlot;
      const time = s.finished ? formatMs(s.timeMs) : 'DNF';
      const row = this.add.text(rowX, 140 + i * 42,
        `${medal(s.position)} ${String(s.position).padStart(2)}. ${s.name.padEnd(16)} ${time}${isMe ? '   << YOU' : ''}`,
        {
          fontFamily: FONT, fontSize: '21px',
          color: isMe ? '#80ffdb' : s.isBot ? '#8d99ae' : '#ffffff', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0, 0.5).setAlpha(0).setX(rowX - 40);
      this.tweens.add({ targets: row, alpha: 1, x: rowX, duration: 250, delay: 120 + i * 90, ease: 'Quad.out' });
    });

    // practice (local) races claim their coin reward here; multiplayer races
    // are credited server-side via /internal/results.
    const player = this.registry.get('player') as Player | undefined;
    const mine = data.standings.find((s) => s.slot === data.mySlot);
    if (data.params.local && player && mine) {
      void api.raceReward(player.playerId, mine.position).then((res) => {
        if (res.coinsAwarded > 0) {
          if (res.coins !== undefined) {
            player.coins = res.coins as number;
            this.registry.set('player', player);
          }
          const coinText = this.add.text(cx, 108, `+🟡${res.coinsAwarded}`, {
            fontFamily: FONT, fontSize: '22px', color: '#ffd60a', stroke: '#000', strokeThickness: 4,
          }).setOrigin(0.5).setAlpha(0);
          this.tweens.add({ targets: coinText, alpha: 1, y: 100, duration: 500, ease: 'Quad.out' });
        }
      }).catch(() => { /* reward is best-effort */ });
    } else if (!data.params.local && mine) {
      // multiplayer payout happened server-side; show the schedule amount
      const MULTI = [200, 120, 80, 50, 30, 20, 15, 10];
      const amount = MULTI[Math.min(mine.position - 1, MULTI.length - 1)];
      this.add.text(cx, 108, `+🟡${amount}`, {
        fontFamily: FONT, fontSize: '22px', color: '#ffd60a', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
    }

    const hasLobby = !!player;
    const again = this.add.text(cx, this.scale.height - 80, hasLobby ? '[ BACK TO LOBBY ]' : '[ RACE AGAIN ]', {
      fontFamily: FONT, fontSize: '26px', color: '#f4a261', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    again.on('pointerover', () => again.setScale(1.06));
    again.on('pointerout', () => again.setScale(1));
    again.on('pointerdown', () => {
      if (hasLobby) this.scene.start('Lobby');
      else location.reload();
    });
  }
}

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function medal(pos: number): string {
  return pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '  ';
}
