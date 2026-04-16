import { describe, expect, it } from 'vitest';
import { BASE_PARAMS, applyUpgrades } from './upgradeApplier';
import { costAtLevel, isMaxed } from './upgradeCatalog';
import { allUpgradeDefs, findUpgrade } from './weaponCatalog';
import { gameplayState } from './gameplayState';

describe('applyUpgrades', () => {
  it('returns base params when no levels are set', () => {
    expect(applyUpgrades({})).toEqual(BASE_PARAMS);
  });

  it('adds sawDamage per level', () => {
    expect(applyUpgrades({ 'saw.damage': 3 }).sawDamage).toBe(BASE_PARAMS.sawDamage + 3);
  });

  it('adds bladeCount per level', () => {
    expect(applyUpgrades({ 'saw.bladeCount': 4 }).bladeCount).toBe(BASE_PARAMS.bladeCount + 4);
  });

  it('widens the channel per level', () => {
    expect(applyUpgrades({ 'chute.channelWidth': 5 }).channelHalfWidth).toBe(
      BASE_PARAMS.channelHalfWidth + 5 * 14,
    );
  });

  it('shortens spawn interval per drop-rate level but clamps at 300ms', () => {
    expect(applyUpgrades({ 'asteroids.dropRate': 2 }).spawnIntervalMs).toBe(1800 - 260);
    expect(applyUpgrades({ 'asteroids.dropRate': 99 }).spawnIntervalMs).toBe(300);
  });

  it('raises chunk HP per level', () => {
    expect(applyUpgrades({ 'asteroids.chunkHp': 7 }).maxHpPerChunk).toBe(BASE_PARAMS.maxHpPerChunk + 7);
  });

  it('expands the chunk-count range uniformly with asteroidSize', () => {
    const e = applyUpgrades({ 'asteroids.asteroidSize': 3 });
    expect(e.minChunks).toBe(BASE_PARAMS.minChunks + 6);
    expect(e.maxChunks).toBe(BASE_PARAMS.maxChunks + 6);
  });

  it('increases bladeSpinSpeed per level', () => {
    expect(applyUpgrades({}).bladeSpinSpeed).toBe(0.005);
    expect(applyUpgrades({ 'saw.spinSpeed': 4 }).bladeSpinSpeed).toBeCloseTo(0.005 + 4 * 0.005);
  });

  it('increases orbitSpeed per level', () => {
    expect(applyUpgrades({}).orbitSpeed).toBe(1);
    expect(applyUpgrades({ 'saw.orbitSpeed': 5 }).orbitSpeed).toBeCloseTo(1 + 5 * 0.6);
  });

  it('increases bladeRadius per level', () => {
    expect(applyUpgrades({}).bladeRadius).toBe(6);
    expect(applyUpgrades({ 'saw.bladeSize': 3 }).bladeRadius).toBe(6 + 3 * 2);
  });

  it('combines multiple upgrades independently', () => {
    const e = applyUpgrades({ 'saw.damage': 2, 'saw.bladeCount': 1, 'asteroids.chunkHp': 1 });
    expect(e.sawDamage).toBe(3);
    expect(e.bladeCount).toBe(2);
    expect(e.maxHpPerChunk).toBe(4);
    expect(e.channelHalfWidth).toBe(BASE_PARAMS.channelHalfWidth);
  });
});

describe('weaponCatalog + upgradeCatalog', () => {
  it('defines all expected upgrades', () => {
    const ids = allUpgradeDefs().map((u) => u.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'saw.damage',
        'saw.bladeCount',
        'saw.spinSpeed',
        'saw.orbitSpeed',
        'saw.bladeSize',
        'chute.channelWidth',
        'asteroids.dropRate',
        'asteroids.chunkHp',
        'asteroids.asteroidSize',
      ]),
    );
  });

  it('findUpgrade looks up by dotted id', () => {
    expect(findUpgrade('saw.damage')?.category).toBe('saw');
    expect(findUpgrade('nope')).toBeUndefined();
  });

  it('costAtLevel grows exponentially with growth rate', () => {
    // Use a synthetic def since placeholder economy has growthRate=1.
    const def = { baseCost: 20, growthRate: 1.5, maxLevel: 10 } as Parameters<typeof costAtLevel>[0];
    const c0 = costAtLevel(def, 0);
    const c1 = costAtLevel(def, 1);
    const c2 = costAtLevel(def, 2);
    expect(c0).toBe(20);
    expect(c1).toBeGreaterThan(c0);
    expect(c2).toBeGreaterThan(c1);
  });

  it('isMaxed flips at the cap', () => {
    const def = findUpgrade('saw.bladeCount')!;
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
    gameplayState.setLevel('saw.damage', 2);
    expect(events).toEqual([['saw.damage', 2]]);
    expect(gameplayState.levelOf('saw.damage')).toBe(2);
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

  it('tracks weapon counts with initWeaponCounts', () => {
    gameplayState.reset();
    gameplayState.initWeaponCounts({ grinder: 1, saw: 1 });
    expect(gameplayState.weaponCount('grinder')).toBe(1);
    expect(gameplayState.weaponCount('saw')).toBe(1);
    expect(gameplayState.weaponCount('laser')).toBe(0);
  });

  it('buyWeapon increments count and emits weaponCountChanged', () => {
    gameplayState.reset();
    gameplayState.initWeaponCounts({ saw: 1 });
    const events: Array<[string, number]> = [];
    gameplayState.on('weaponCountChanged', (id, count) => events.push([id, count]));
    gameplayState.buyWeapon('saw');
    expect(gameplayState.weaponCount('saw')).toBe(2);
    expect(events).toEqual([['saw', 2]]);
  });

  it('sellWeapon decrements count but not below 1', () => {
    gameplayState.reset();
    gameplayState.initWeaponCounts({ saw: 2 });
    const events: Array<[string, number]> = [];
    gameplayState.on('weaponCountChanged', (id, count) => events.push([id, count]));
    expect(gameplayState.sellWeapon('saw')).toBe(true);
    expect(gameplayState.weaponCount('saw')).toBe(1);
    expect(gameplayState.sellWeapon('saw')).toBe(false);
    expect(gameplayState.weaponCount('saw')).toBe(1);
    expect(events).toEqual([['saw', 1]]);
  });
});
