import { describe, expect, it } from 'vitest';
import {
  WEAPON_TYPES,
  CATEGORY_DEFS,
  findWeaponType,
  findCategory,
  allUpgradeDefs,
  findUpgrade,
  weaponBuyCost,
} from './weaponCatalog';

describe('weaponCatalog', () => {
  it('defines grinder and saw as unlocked weapon types', () => {
    const ids = WEAPON_TYPES.map((w) => w.id);
    expect(ids).toContain('grinder');
    expect(ids).toContain('saw');
    expect(findWeaponType('grinder')?.locked).toBe(false);
    expect(findWeaponType('saw')?.locked).toBe(false);
  });

  it('defines all weapons as unlocked', () => {
    expect(findWeaponType('laser')?.locked).toBe(false);
    expect(findWeaponType('missile')?.locked).toBe(false);
    expect(findWeaponType('blackhole')?.locked).toBe(false);
  });

  it('defines the asteroids and spawn categories', () => {
    const ids = CATEGORY_DEFS.map((c) => c.id);
    expect(ids).toEqual(['asteroids', 'spawn']);
  });

  describe('audit-locked cost curves (2026-04-19)', () => {
    it('saw.damage: $15 / 1.25× / uncapped', () => {
      const u = findUpgrade('saw.damage')!;
      expect(u.baseCost).toBe(15);
      expect(u.growthRate).toBe(1.25);
      expect(u.maxLevel).toBe(Number.POSITIVE_INFINITY);
    });
    it('saw.bladeCount: $2500 / 4.0× / cap 5', () => {
      const u = findUpgrade('saw.bladeCount')!;
      expect(u.baseCost).toBe(2500);
      expect(u.growthRate).toBe(4);
      expect(u.maxLevel).toBe(5);
    });
    it('spawn.rate: $200 / 2.2× / cap 12', () => {
      const u = findUpgrade('spawn.rate')!;
      expect(u.baseCost).toBe(200);
      expect(u.growthRate).toBe(2.2);
      expect(u.maxLevel).toBe(12);
    });
    it('spawn.amplitude: $80 / 1.5× / cap 10', () => {
      const u = findUpgrade('spawn.amplitude')!;
      expect(u.baseCost).toBe(80);
      expect(u.growthRate).toBe(1.5);
      expect(u.maxLevel).toBe(10);
    });
    it('chunkHp, grinder.damage, saw.damage, laser.damage share Tier-S curve', () => {
      const ids = ['asteroids.chunkHp', 'grinder.damage', 'saw.damage', 'laser.damage'];
      for (const id of ids) {
        const u = findUpgrade(id)!;
        expect(u.baseCost).toBe(15);
        expect(u.growthRate).toBe(1.25);
        expect(u.maxLevel).toBe(Number.POSITIVE_INFINITY);
      }
    });
    it('asteroidSize cap raised to 20', () => {
      expect(findUpgrade('asteroids.asteroidSize')!.maxLevel).toBe(20);
    });
    it('blackhole.maxTargets cap raised to 20', () => {
      expect(findUpgrade('blackhole.maxTargets')!.maxLevel).toBe(20);
    });
  });

  it('grinder and missile start at 1; other weapons start at 0', () => {
    for (const w of WEAPON_TYPES) {
      if (w.id === 'grinder' || w.id === 'missile') {
        expect(w.startCount).toBe(1);
      } else {
        expect(w.startCount).toBe(0);
      }
    }
  });

  it('saw has at least one upgrade', () => {
    const saw = findWeaponType('saw')!;
    expect(saw.upgrades.length).toBeGreaterThan(0);
  });

  it('grinder has damage, spinSpeed, bladeSize upgrades', () => {
    const grinder = findWeaponType('grinder')!;
    const ids = grinder.upgrades.map((u) => u.id);
    expect(ids).toEqual(['grinder.damage', 'grinder.spinSpeed', 'grinder.bladeSize']);
  });

  it('each category has at least one upgrade', () => {
    for (const c of CATEGORY_DEFS) {
      expect(c.upgrades.length).toBeGreaterThan(0);
    }
  });

  it('upgrade IDs use dotted prefix matching their parent', () => {
    for (const w of WEAPON_TYPES) {
      for (const u of w.upgrades) {
        expect(u.id).toMatch(new RegExp(`^${w.id}\\.`));
      }
    }
    for (const c of CATEGORY_DEFS) {
      for (const u of c.upgrades) {
        expect(u.id).toMatch(new RegExp(`^${c.id}\\.`));
      }
    }
  });

  it('allUpgradeDefs returns every upgrade across weapons and categories', () => {
    const all = allUpgradeDefs();
    const totalExpected =
      WEAPON_TYPES.reduce((n, w) => n + w.upgrades.length, 0) +
      CATEGORY_DEFS.reduce((n, c) => n + c.upgrades.length, 0);
    expect(all.length).toBe(totalExpected);
  });

  it('findUpgrade resolves dotted IDs', () => {
    expect(findUpgrade('saw.damage')).toBeDefined();
    expect(findUpgrade('saw.damage')?.name).toBe('Saw Damage');
    expect(findUpgrade('nope')).toBeUndefined();
  });

  it('findCategory resolves by id', () => {
    expect(findCategory('asteroids')?.name).toBe('Asteroids');
    expect(findCategory('nope')).toBeUndefined();
  });
});

describe('weaponBuyCost', () => {
  it('returns 0 when boughtThisRun < freeSlots', () => {
    expect(weaponBuyCost({ boughtThisRun: 0, freeSlots: 2, baseCost: 100 })).toBe(0);
    expect(weaponBuyCost({ boughtThisRun: 1, freeSlots: 2, baseCost: 100 })).toBe(0);
  });

  it('returns baseCost when boughtThisRun >= freeSlots', () => {
    expect(weaponBuyCost({ boughtThisRun: 2, freeSlots: 2, baseCost: 100 })).toBe(100);
    expect(weaponBuyCost({ boughtThisRun: 5, freeSlots: 2, baseCost: 100 })).toBe(100);
  });

  it('returns baseCost when freeSlots is 0', () => {
    expect(weaponBuyCost({ boughtThisRun: 0, freeSlots: 0, baseCost: 50 })).toBe(50);
  });
});
