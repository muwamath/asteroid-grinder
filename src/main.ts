import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { gameplayState } from './game/gameplayState';
import { loadFromLocalStorage, OFFLINE_CAP_MS, MIN_OFFLINE_MS } from './game/saveState';
import { computeOfflineAward } from './game/offlineProgress';

const debug = new URLSearchParams(window.location.search).has('debug');

const snapshot = loadFromLocalStorage();
let offlineAward = 0;
let offlineElapsedMs = 0;
if (snapshot) {
  offlineElapsedMs = Math.max(0, Date.now() - snapshot.savedAt);
  if (offlineElapsedMs >= MIN_OFFLINE_MS) {
    offlineAward = computeOfflineAward({
      rate: snapshot.emaCashPerSec,
      elapsedMs: offlineElapsedMs,
      capMs: OFFLINE_CAP_MS,
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 2560,
  height: 1440,
  backgroundColor: '#1a1a28',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    fullscreenTarget: 'game',
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

game.registry.set('pendingSnapshot', snapshot);
game.registry.set('offlineAward', offlineAward);
game.registry.set('offlineElapsedMs', Math.min(offlineElapsedMs, OFFLINE_CAP_MS));

// Always expose for console tinkering. The overlay itself is still key-toggled
// (backtick ` in-game, or options-menu button); these handles are harmless idle.
const w = window as unknown as { __GAME__: unknown; __STATE__: unknown };
w.__GAME__ = game;
w.__STATE__ = gameplayState;
