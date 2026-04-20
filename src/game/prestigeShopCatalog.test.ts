import { describe, it, expect } from 'vitest';
import {
  PRESTIGE_SHOP, findShopEntry, shopCostAtLevel, isShopMaxed,
} from './prestigeShopCatalog';

describe('prestigeShopCatalog', () => {
  it('defines exactly 13 entries', () => {
    expect(PRESTIGE_SHOP.length).toBe(13);
  });

  it('arena.preUnlockedSlots is removed (vestigial after slot-lock removal)', () => {
    expect(findShopEntry('arena.preUnlockedSlots')).toBeUndefined();
  });

  it('prestige.shardMultiplier exists: multiplier family, $15 base, 1.8× growth, max 20', () => {
    const e = findShopEntry('prestige.shardMultiplier');
    expect(e).toBeDefined();
    expect(e!.family).toBe('multiplier');
    expect(e!.baseCost).toBe(15);
    expect(e!.growthRate).toBe(1.8);
    expect(e!.maxLevel).toBe(20);
  });

  it('offline.rate exists: economy family, $40 base, 2.5× growth, max 6', () => {
    const e = findShopEntry('offline.rate');
    expect(e).toBeDefined();
    expect(e!.family).toBe('economy');
    expect(e!.baseCost).toBe(40);
    expect(e!.growthRate).toBe(2.5);
    expect(e!.maxLevel).toBe(6);
  });

  it('includes all four free-weapon slots', () => {
    const freeIds = PRESTIGE_SHOP.filter((e) => e.family === 'free-weapon').map((e) => e.id);
    expect(freeIds.sort()).toEqual(['free.blackhole', 'free.laser', 'free.missile', 'free.saw']);
  });

  it('findShopEntry returns entry by id', () => {
    const e = findShopEntry('mult.cash');
    expect(e?.family).toBe('multiplier');
  });

  it('shopCostAtLevel grows by growthRate', () => {
    const e = findShopEntry('mult.cash')!;
    expect(shopCostAtLevel(e, 0)).toBe(Math.floor(e.baseCost));
    expect(shopCostAtLevel(e, 1)).toBe(Math.floor(e.baseCost * e.growthRate));
    expect(shopCostAtLevel(e, 2)).toBe(Math.floor(e.baseCost * e.growthRate ** 2));
  });

  it('isShopMaxed respects max level; infinite is Infinity', () => {
    const refinement = findShopEntry('refinement')!;
    expect(refinement.maxLevel).toBe(6);
    expect(isShopMaxed(refinement, 6)).toBe(true);
    expect(isShopMaxed(refinement, 5)).toBe(false);

    const freeSaw = findShopEntry('free.saw')!;
    expect(freeSaw.maxLevel).toBe(Infinity);
    expect(isShopMaxed(freeSaw, 100)).toBe(false);
  });
});
