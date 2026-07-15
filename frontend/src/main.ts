import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GarageScene } from './scenes/GarageScene';
import { ShopScene } from './scenes/ShopScene';
import { TrackSelectScene } from './scenes/TrackSelectScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { MatchmakingScene } from './scenes/MatchmakingScene';
import { RaceScene } from './scenes/RaceScene';
import { ResultsScene } from './scenes/ResultsScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 640,
  pixelArt: true,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: { createContainer: true },
  scene: [
    BootScene, LoginScene, LobbyScene, GarageScene, ShopScene,
    TrackSelectScene, LeaderboardScene, MatchmakingScene, RaceScene, ResultsScene,
  ],
});

// Exposed for automated tests (scene assertions in headless browsers).
declare global { interface Window { __game: Phaser.Game } }
window.__game = game;
