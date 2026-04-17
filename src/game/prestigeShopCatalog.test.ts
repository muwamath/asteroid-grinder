import { describe, it, expect } from 'vitest';
import {
  PRESTIGE_SHOP, findShopEntry, shopCostAtLevel, isShopMaxed,
} from './prestigeShopCatalog';

describe('prestigeShopCatalog', () => {
  it('defines exactly 12 entries', () => {
    expect(PRESTIGE_SHOP.length).toBe(12);
  });

  it('exposes arena.preUnlockedSlots with level cap MAX_SLOTS - 1', async () => {
    const { MAX_SLOTS } = await import('./arena/arenaConstants');
    const entry = findShopEntry('arena.preUnlockedSlots');
    expect(entry).toBeDefined();
    expect(entry!.maxLevel).toBe(MAX_SLOTS - 1);
    expect(entry!.family).toBe('economy');
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
