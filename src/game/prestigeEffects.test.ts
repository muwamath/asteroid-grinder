import { describe, it, expect } from 'vitest';
import { BASE_PARAMS } from './upgradeApplier';
import { applyPrestigeEffects } from './prestigeEffects';

describe('applyPrestigeEffects', () => {
  it('returns BASE_PARAMS unchanged with empty prestige levels', () => {
    const out = applyPrestigeEffects(BASE_PARAMS, {});
    expect(out.cashMultiplier).toBe(1);
    expect(out.damageMultiplier).toBe(1);
    expect(out.upgradeCostMultiplier).toBe(1);
    expect(out.fillerFraction).toBe(0.8);
    expect(out.shardYieldBonus).toBe(0);
    expect(out.startingCash).toBe(0);
    expect(out.freeSlotCount.saw).toBe(0);
  });

  it('mult.cash: +10% per level', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'mult.cash': 3 }).cashMultiplier).toBeCloseTo(1.3);
  });

  it('mult.damage: +5% per level and scales raw damage fields', () => {
    const out = applyPrestigeEffects(BASE_PARAMS, { 'mult.damage': 4 });
    expect(out.damageMultiplier).toBeCloseTo(1.2);
    expect(out.sawDamage).toBeCloseTo(BASE_PARAMS.sawDamage * 1.2);
    expect(out.laserDamage).toBeCloseTo(BASE_PARAMS.laserDamage * 1.2);
    expect(out.missileDamage).toBeCloseTo(BASE_PARAMS.missileDamage * 1.2);
    expect(out.blackholeCoreDamage).toBeCloseTo(BASE_PARAMS.blackholeCoreDamage * 1.2);
    expect(out.grinderDamage).toBeCloseTo(BASE_PARAMS.grinderDamage * 1.2);
  });

  it('discount.upgrade: -5% per level, capped at -50%', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'discount.upgrade': 3 }).upgradeCostMultiplier).toBeCloseTo(0.85);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'discount.upgrade': 100 }).upgradeCostMultiplier).toBe(0.5);
  });

  it('refinement: filler -5% per level, floor 50%', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { refinement: 2 }).fillerFraction).toBeCloseTo(0.7);
    expect(applyPrestigeEffects(BASE_PARAMS, { refinement: 100 }).fillerFraction).toBe(0.5);
  });

  it('offline.cap: [8h, 12h, 24h, 48h] steps', () => {
    const h = 60 * 60 * 1000;
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 0 }).offlineCapMs).toBe(8 * h);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 1 }).offlineCapMs).toBe(12 * h);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 2 }).offlineCapMs).toBe(24 * h);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 3 }).offlineCapMs).toBe(48 * h);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 99 }).offlineCapMs).toBe(48 * h);
  });

  it('shard.yield: +1 per level', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'shard.yield': 4 }).shardYieldBonus).toBe(4);
  });

  it('start.cash: +$50 per level', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'start.cash': 3 }).startingCash).toBe(150);
  });

  it('free.saw / free.laser / free.missile / free.blackhole → freeSlotCount map', () => {
    const out = applyPrestigeEffects(BASE_PARAMS, {
      'free.saw': 2, 'free.laser': 1, 'free.missile': 0, 'free.blackhole': 3,
    });
    expect(out.freeSlotCount.saw).toBe(2);
    expect(out.freeSlotCount.laser).toBe(1);
    expect(out.freeSlotCount.missile).toBe(0);
    expect(out.freeSlotCount.blackhole).toBe(3);
  });

  it('prestige.shardMultiplier: +5% per level (L20 = 2.0×)', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, {}).shardYieldMultiplier).toBe(1);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'prestige.shardMultiplier': 4 }).shardYieldMultiplier).toBeCloseTo(1.2);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'prestige.shardMultiplier': 20 }).shardYieldMultiplier).toBeCloseTo(2.0);
  });

  it('offline.rate: +15% per level (L6 = 1.9×)', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, {}).offlineRateMultiplier).toBe(1);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.rate': 2 }).offlineRateMultiplier).toBeCloseTo(1.3);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.rate': 6 }).offlineRateMultiplier).toBeCloseTo(1.9);
  });
});
