import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { gameplayState } from './game/gameplayState';

const debug = new URLSearchParams(window.location.search).has('debug');

const game = new Phaser.Game({
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
      // pile pressure even with rigid compound bodies.
      positionIterations: 20,
      velocityIterations: 14,
      constraintIterations: 16,
      // Sleeping: bodies stacked and nearly stationary enter a frozen state
      // Matter doesn't try to re-solve each tick. Critical for stable rigid
      // piles; without it, pile pressure + kinematic fall produces
      // unresolvable interpenetration.
      enableSleeping: true,
    },
  },
  scene: [GameScene, UIScene],
});

if (debug) {
  const w = window as unknown as { __GAME__: unknown; __STATE__: unknown };
  w.__GAME__ = game;
  w.__STATE__ = gameplayState;
}
