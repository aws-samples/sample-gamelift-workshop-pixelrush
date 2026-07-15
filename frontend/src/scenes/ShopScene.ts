import Phaser from 'phaser';
import { api, type Player, type ShopCar } from '../api';
import { title, button, statusBar, toast, contentCx, carCard, CAR_CARD, pageFrame } from './ui';
import { ChatPanel } from './ChatPanel';

export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  async create(): Promise<void> {
    const player = this.registry.get('player') as Player;
    title(this, 'CAR SHOP');
    statusBar(this, player);
    new ChatPanel(this);
    pageFrame(this, { chatDivider: true });
    button(this, 70, this.scale.height - 36, '< back', () => this.scene.start('Lobby'), { size: 16 })
      .setDepth(150);

    let cars: ShopCar[] = [];
    try {
      cars = (await api.shop(player.playerId)).cars;
    } catch (e) {
      toast(this, (e as Error).message);
      return;
    }

    // two cards per row (8 cars = 4 rows, no scrolling needed)
    const cx = contentCx(this);
    const gap = 14;
    cars.forEach((car, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = cx + (col === 0 ? -(CAR_CARD.W + gap) / 2 : (CAR_CARD.W + gap) / 2);
      const y = 150 + row * (CAR_CARD.H + 10);
      carCard(this, x, y, {
        carId: car.carId,
        name: car.name,
        statLine: `speed +${Math.round((car.speedBonus - 1) * 100)}%  ${'★'.repeat(car.handling)}`,
        subLine: car.owned ? undefined : car.description,
        rightLabel: car.owned ? 'OWNED' : `🟡${car.price}`,
        rightColor: car.owned ? '#2a9d8f' : car.affordable ? '#ffd60a' : '#6c757d',
        highlighted: car.owned,
        onClick: car.owned || !car.affordable ? undefined : async () => {
          try {
            const res = await api.buy(player.playerId, car.carId);
            this.registry.set('player', res.player);
            toast(this, `Bought ${car.name}!`, '#80ffdb');
            this.time.delayedCall(600, () => this.scene.restart());
          } catch (e) { toast(this, (e as Error).message); }
        },
      });
    });
  }
}
