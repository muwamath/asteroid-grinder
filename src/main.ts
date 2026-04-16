import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const debug = new URLSearchParams(window.location.search).has('debug');

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a28',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      debug,
      // Bump solver iterations so chunks pinned between walls/saw/other
      // asteroids don't interpenetrate. Default is 6/4 — insufficient for
      // the welded-cluster + static-channel pressure combo.
      positionIterations: 20,
      velocityIterations: 14,
      constraintIterations: 4,
    },
  },
  scene: [GameScene, UIScene],
});
