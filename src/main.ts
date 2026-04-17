import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { gameplayState } from './game/gameplayState';
import { prestigeState } from './game/prestigeState';
import { loadFromLocalStorage, MIN_OFFLINE_MS } from './game/saveState';
import { computeOfflineAward } from './game/offlineProgress';
import { applyPrestigeEffects } from './game/prestigeEffects';
import { BASE_PARAMS } from './game/upgradeApplier';

const debug = new URLSearchParams(window.location.search).has('debug');

const snapshot = loadFromLocalStorage();

// Seed prestige state before computing offline cap so cap-extender levels apply.
if (snapshot) {
  prestigeState.loadSnapshot({
    shards: snapshot.prestigeShards,
    prestigeCount: snapshot.prestigeCount,
    shopLevels: snapshot.prestigeShopLevels,
  });
}

const prestigeParams = applyPrestigeEffects(BASE_PARAMS, prestigeState.shopLevels());
const offlineCap = prestigeParams.offlineCapMs;

let offlineAward = 0;
let offlineElapsedMs = 0;
if (snapshot) {
  offlineElapsedMs = Math.max(0, Date.now() - snapshot.savedAt);
  if (offlineElapsedMs >= MIN_OFFLINE_MS) {
    offlineAward = computeOfflineAward({
      rate: snapshot.emaCashPerSec,
      elapsedMs: offlineElapsedMs,
      capMs: offlineCap,
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
      positionIterations: 20,
      velocityIterations: 14,
      constraintIterations: 16,
      enableSleeping: true,
    },
  },
  scene: [GameScene, UIScene],
});

game.registry.set('pendingSnapshot', snapshot);
game.registry.set('offlineAward', offlineAward);
game.registry.set('offlineElapsedMs', Math.min(offlineElapsedMs, offlineCap));

const w = window as unknown as {
  __GAME__: unknown;
  __STATE__: unknown;
  __PRESTIGE__: unknown;
  __ARENA__: () => unknown;
};
w.__GAME__ = game;
w.__STATE__ = gameplayState;
w.__PRESTIGE__ = prestigeState;
w.__ARENA__ = () => {
  const scene = game.scene.getScene('game') as unknown as { arenaLayout?: unknown };
  return scene?.arenaLayout;
};
