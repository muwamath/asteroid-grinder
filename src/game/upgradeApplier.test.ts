import { describe, expect, it } from 'vitest';
import { BASE_PARAMS, applyUpgrades } from './upgradeApplier';
import { UPGRADE_CATALOG, costAtLevel, findUpgrade, isMaxed } from './upgradeCatalog';
import { gameplayState } from './gameplayState';

describe('applyUpgrades', () => {
  it('returns base params when no levels are set', () => {
    expect(applyUpgrades({})).toEqual(BASE_PARAMS);
  });

  it('adds sawDamage per level', () => {
    expect(applyUpgrades({ sawDamage: 3 }).sawDamage).toBe(BASE_PARAMS.sawDamage + 3);
  });

  it('adds bladeCount per level', () => {
    expect(applyUpgrades({ bladeCount: 4 }).bladeCount).toBe(BASE_PARAMS.bladeCount + 4);
  });

  it('widens the channel per level', () => {
    expect(applyUpgrades({ channelWidth: 5 }).channelHalfWidth).toBe(
      BASE_PARAMS.channelHalfWidth + 5 * 14,
    );
  });

  it('shortens spawn interval per drop-rate level but clamps at 300ms', () => {
    expect(applyUpgrades({ dropRate: 2 }).spawnIntervalMs).toBe(1800 - 260);
    expect(applyUpgrades({ dropRate: 99 }).spawnIntervalMs).toBe(300);
  });

  it('raises chunk HP per level', () => {
    expect(applyUpgrades({ chunkHp: 7 }).maxHpPerChunk).toBe(BASE_PARAMS.maxHpPerChunk + 7);
  });

  it('expands the chunk-count range uniformly with asteroidSize', () => {
    const e = applyUpgrades({ asteroidSize: 3 });
    expect(e.minChunks).toBe(BASE_PARAMS.minChunks + 6);
    expect(e.maxChunks).toBe(BASE_PARAMS.maxChunks + 6);
  });

  it('combines multiple upgrades independently', () => {
    const e = applyUpgrades({ sawDamage: 2, bladeCount: 1, chunkHp: 1 });
    expect(e.sawDamage).toBe(3);
    expect(e.bladeCount).toBe(2);
    expect(e.maxHpPerChunk).toBe(4);
    expect(e.channelHalfWidth).toBe(BASE_PARAMS.channelHalfWidth);
  });
});

describe('upgradeCatalog', () => {
  it('defines all expected upgrades', () => {
    const ids = UPGRADE_CATALOG.map((u) => u.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sawDamage',
        'bladeCount',
        'channelWidth',
        'dropRate',
        'chunkHp',
        'asteroidSize',
      ]),
    );
  });

  it('findUpgrade looks up by id', () => {
    expect(findUpgrade('sawDamage')?.category).toBe('saw');
    expect(findUpgrade('nope')).toBeUndefined();
  });

  it('costAtLevel grows exponentially', () => {
    const def = findUpgrade('sawDamage')!;
    expect(costAtLevel(def, 0)).toBe(def.baseCost);
    const c1 = costAtLevel(def, 1);
    const c2 = costAtLevel(def, 2);
    expect(c1).toBeGreaterThan(def.baseCost);
    expect(c2).toBeGreaterThan(c1);
  });

  it('isMaxed flips at the cap', () => {
    const def = findUpgrade('bladeCount')!;
    expect(isMaxed(def, def.maxLevel - 1)).toBe(false);
    expect(isMaxed(def, def.maxLevel)).toBe(true);
  });
});

describe('gameplayState', () => {
  it('addCash emits cashChanged with running total and delta', () => {
    gameplayState.reset();
    const events: Array<[number, number]> = [];
    gameplayState.on('cashChanged', (cash, delta) => events.push([cash, delta]));
    gameplayState.addCash(10);
    gameplayState.addCash(5);
    expect(events).toEqual([
      [10, 10],
      [15, 5],
    ]);
    expect(gameplayState.cash).toBe(15);
  });

  it('trySpend only deducts if enough cash and returns a boolean', () => {
    gameplayState.reset();
    gameplayState.addCash(20);
    expect(gameplayState.trySpend(25)).toBe(false);
    expect(gameplayState.cash).toBe(20);
    expect(gameplayState.trySpend(15)).toBe(true);
    expect(gameplayState.cash).toBe(5);
  });

  it('setLevel emits upgradeLevelChanged and persists', () => {
    gameplayState.reset();
    const events: Array<[string, number]> = [];
    gameplayState.on('upgradeLevelChanged', (id, lvl) => events.push([id, lvl]));
    gameplayState.setLevel('sawDamage', 2);
    expect(events).toEqual([['sawDamage', 2]]);
    expect(gameplayState.levelOf('sawDamage')).toBe(2);
  });

  it('on() returns an unsubscribe function', () => {
    gameplayState.reset();
    let count = 0;
    const off = gameplayState.on('cashChanged', () => count++);
    gameplayState.addCash(1);
    off();
    gameplayState.addCash(1);
    expect(count).toBe(1);
  });
});
