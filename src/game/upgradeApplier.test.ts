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

  it('adds grinderDamage per level', () => {
    expect(applyUpgrades({ 'grinder.damage': 3 }).grinderDamage).toBe(BASE_PARAMS.grinderDamage + 3);
  });

  it('scales grinderSpinSpeed per level', () => {
    expect(applyUpgrades({ 'grinder.spinSpeed': 2 }).grinderSpinSpeed).toBeCloseTo(
      BASE_PARAMS.grinderSpinSpeed + 2 * 0.4, 5,
    );
  });

  it('scales grinderBladeScale per level', () => {
    expect(applyUpgrades({ 'grinder.bladeSize': 4 }).grinderBladeScale).toBeCloseTo(
      BASE_PARAMS.grinderBladeScale + 4 * 0.1, 5,
    );
  });

  it('adds bladeCount per level', () => {
    expect(applyUpgrades({ 'saw.bladeCount': 4 }).bladeCount).toBe(BASE_PARAMS.bladeCount + 4);
  });

  it('shortens spawn interval per spawn.rate level but clamps at 300ms', () => {
    expect(applyUpgrades({ 'spawn.rate': 2 }).spawnIntervalMs).toBe(1800 - 260);
    expect(applyUpgrades({ 'spawn.rate': 99 }).spawnIntervalMs).toBe(300);
  });

  it('scales spawnAmplitudeMultiplier per spawn.amplitude level (L0=0.5 → L10=1.0)', () => {
    expect(applyUpgrades({}).spawnAmplitudeMultiplier).toBeCloseTo(0.5);
    expect(applyUpgrades({ 'spawn.amplitude': 5 }).spawnAmplitudeMultiplier).toBeCloseTo(0.75);
    expect(applyUpgrades({ 'spawn.amplitude': 10 }).spawnAmplitudeMultiplier).toBeCloseTo(1.0);
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

  it('increases laserAimSpeed per level', () => {
    expect(applyUpgrades({}).laserAimSpeed).toBe(30);
    expect(applyUpgrades({ 'laser.aimSpeed': 4 }).laserAimSpeed).toBeCloseTo(30 + 4 * 16.5);
  });

  it('increases laserRange per level (reaches ~1/4 screen by L20)', () => {
    expect(applyUpgrades({}).laserRange).toBe(60);
    expect(applyUpgrades({ 'laser.range': 5 }).laserRange).toBe(60 + 5 * 30);
    expect(applyUpgrades({ 'laser.range': 20 }).laserRange).toBe(660);
  });

  it('increases laserDamage per level', () => {
    expect(applyUpgrades({}).laserDamage).toBe(1);
    expect(applyUpgrades({ 'laser.damage': 6 }).laserDamage).toBeCloseTo(1 + 6 * 0.5);
  });

  it('decreases laserCooldown per level with floor', () => {
    expect(applyUpgrades({}).laserCooldown).toBe(2);
    expect(applyUpgrades({ 'laser.cooldown': 5 }).laserCooldown).toBeCloseTo(2 - 5 * 0.095);
    expect(applyUpgrades({ 'laser.cooldown': 99 }).laserCooldown).toBe(0.1);
  });

  it('decreases missileFireInterval per level with floor', () => {
    expect(applyUpgrades({}).missileFireInterval).toBe(5);
    expect(applyUpgrades({ 'missile.fireRate': 4 }).missileFireInterval).toBeCloseTo(5 - 4 * 0.225);
    expect(applyUpgrades({ 'missile.fireRate': 99 }).missileFireInterval).toBe(0.5);
  });

  it('increases missileDamage per level', () => {
    expect(applyUpgrades({}).missileDamage).toBe(2);
    expect(applyUpgrades({ 'missile.damage': 3 }).missileDamage).toBeCloseTo(2 + 3 * 1.5);
  });

  it('increases missileBlastRadius per level', () => {
    expect(applyUpgrades({}).missileBlastRadius).toBe(20);
    expect(applyUpgrades({ 'missile.blastRadius': 5 }).missileBlastRadius).toBe(20 + 5 * 4);
  });

  it('increases missileSpeed per level', () => {
    expect(applyUpgrades({}).missileSpeed).toBe(80);
    expect(applyUpgrades({ 'missile.speed': 4 }).missileSpeed).toBe(80 + 4 * 12);
  });

  it('increases missileHoming per level', () => {
    expect(applyUpgrades({}).missileHoming).toBe(0);
    expect(applyUpgrades({ 'missile.homing': 6 }).missileHoming).toBeCloseTo(6 * 0.5);
  });

  it('increases blackholePullRange per level', () => {
    expect(applyUpgrades({}).blackholePullRange).toBe(60);
    expect(applyUpgrades({ 'blackhole.pullRange': 5 }).blackholePullRange).toBe(60 + 5 * 8);
  });

  it('increases blackholePullForce per level', () => {
    expect(applyUpgrades({}).blackholePullForce).toBe(0.0003);
    expect(applyUpgrades({ 'blackhole.pullForce': 4 }).blackholePullForce).toBeCloseTo(0.0003 + 4 * 0.00015);
  });

  it('increases blackholeCoreSize per level', () => {
    expect(applyUpgrades({}).blackholeCoreSize).toBe(15);
    expect(applyUpgrades({ 'blackhole.coreSize': 3 }).blackholeCoreSize).toBe(15 + 3 * 3);
  });

  it('increases blackholeCoreDamage per level', () => {
    expect(applyUpgrades({}).blackholeCoreDamage).toBe(1);
    expect(applyUpgrades({ 'blackhole.coreDamage': 6 }).blackholeCoreDamage).toBeCloseTo(1 + 6 * 0.5);
  });

  it('increases blackholeMaxTargets per level', () => {
    expect(applyUpgrades({}).blackholeMaxTargets).toBe(3);
    expect(applyUpgrades({ 'blackhole.maxTargets': 4 }).blackholeMaxTargets).toBe(3 + 4);
  });

  it('raises qualityLevel per asteroid-quality level', () => {
    expect(applyUpgrades({}).qualityLevel).toBe(0);
    expect(applyUpgrades({ 'asteroids.quality': 5 }).qualityLevel).toBe(5);
  });

  it('scales fallSpeedMultiplier per asteroid-fallSpeed level', () => {
    expect(applyUpgrades({}).fallSpeedMultiplier).toBeCloseTo(0.3);
    expect(applyUpgrades({ 'asteroids.fallSpeed': 3 }).fallSpeedMultiplier).toBeCloseTo(1.2);
  });

  it('combines multiple upgrades independently', () => {
    const e = applyUpgrades({ 'saw.damage': 2, 'saw.bladeCount': 1, 'asteroids.chunkHp': 1 });
    expect(e.sawDamage).toBe(3);
    expect(e.bladeCount).toBe(2);
    expect(e.maxHpPerChunk).toBe(2);
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
        'laser.aimSpeed',
        'laser.range',
        'laser.damage',
        'laser.cooldown',
        'missile.fireRate',
        'missile.damage',
        'missile.blastRadius',
        'missile.speed',
        'missile.homing',
        'blackhole.pullRange',
        'blackhole.pullForce',
        'blackhole.coreSize',
        'blackhole.coreDamage',
        'blackhole.maxTargets',
        'asteroids.chunkHp',
        'asteroids.asteroidSize',
        'asteroids.quality',
        'asteroids.fallSpeed',
        'spawn.rate',
        'spawn.amplitude',
      ]),
    );
  });

  it('includes asteroidQuality and asteroidFallSpeed in Asteroids category', () => {
    expect(findUpgrade('asteroids.quality')?.category).toBe('asteroids');
    expect(findUpgrade('asteroids.fallSpeed')?.category).toBe('asteroids');
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

  it('totalInstancesBoughtThisRun tracks live non-grinder inventory (buy + sell)', () => {
    gameplayState.reset();
    gameplayState.initWeaponCounts({ grinder: 1, missile: 1 });
    expect(gameplayState.totalInstancesBoughtThisRun()).toBe(1); // pre-installed missile
    gameplayState.buyWeapon('saw');
    gameplayState.buyWeapon('laser');
    expect(gameplayState.totalInstancesBoughtThisRun()).toBe(3);
    gameplayState.sellWeapon('laser');
    gameplayState.sellWeapon('saw');
    gameplayState.sellWeapon('missile');
    expect(gameplayState.totalInstancesBoughtThisRun()).toBe(0);
  });

  it('sellWeapon decrements count down to zero and refuses below', () => {
    gameplayState.reset();
    gameplayState.initWeaponCounts({ saw: 2 });
    const events: Array<[string, number]> = [];
    gameplayState.on('weaponCountChanged', (id, count) => events.push([id, count]));
    expect(gameplayState.sellWeapon('saw')).toBe(true);
    expect(gameplayState.weaponCount('saw')).toBe(1);
    expect(gameplayState.sellWeapon('saw')).toBe(true);
    expect(gameplayState.weaponCount('saw')).toBe(0);
    // Below zero is refused.
    expect(gameplayState.sellWeapon('saw')).toBe(false);
    expect(gameplayState.weaponCount('saw')).toBe(0);
    expect(events).toEqual([['saw', 1], ['saw', 0]]);
  });
});
