import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const debug = new URLSearchParams(window.location.search).has('debug');

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 900,
  height: 640,
  backgroundColor: '#1a1a28',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      debug,
    },
  },
  scene: [GameScene, UIScene],
});
