import Phaser from 'phaser';
import { api, type Player, type ShopCar } from '../api';
import { title, button, statusBar, toast, contentCx, carCard, CAR_CARD, pageFrame } from './ui';
import { ChatPanel } from './ChatPanel';

export class GarageScene extends Phaser.Scene {
  constructor() { super('Garage'); }

  async create(): Promise<void> {
    const player = this.registry.get('player') as Player;
    title(this, 'GARAGE');
    statusBar(this, player);
    new ChatPanel(this);
    pageFrame(this, { chatDivider: true });
    button(this, 70, this.scale.height - 36, '< back', () => this.scene.start('Lobby'), { size: 16 });

    let cars: ShopCar[] = [];
    try {
      cars = (await api.garage(player.playerId)).cars;
    } catch (e) {
      toast(this, (e as Error).message);
      return;
    }

    // two cards per row: icon left, text right, whole card clickable
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
        subLine: car.selected ? 'currently selected' : 'click to select',
        rightLabel: car.selected ? '✔ SELECTED' : undefined,
        rightColor: '#ffd60a',
        highlighted: !!car.selected,
        onClick: car.selected ? undefined : async () => {
          try {
            await api.selectCar(player.playerId, car.carId);
            player.selectedCar = car.carId;
            this.registry.set('player', player);
            this.scene.restart();
          } catch (e) { toast(this, (e as Error).message); }
        },
      });
    });
  }
}
