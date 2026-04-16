import { describe, expect, it } from 'vitest';
import {
  WEAPON_TYPES,
  CATEGORY_DEFS,
  findWeaponType,
  findCategory,
  allUpgradeDefs,
  findUpgrade,
} from './weaponCatalog';

describe('weaponCatalog', () => {
  it('defines grinder and saw as unlocked weapon types', () => {
    const ids = WEAPON_TYPES.map((w) => w.id);
    expect(ids).toContain('grinder');
    expect(ids).toContain('saw');
    expect(findWeaponType('grinder')?.locked).toBe(false);
    expect(findWeaponType('saw')?.locked).toBe(false);
  });

  it('defines missile and blackhole as locked, laser as unlocked', () => {
    expect(findWeaponType('laser')?.locked).toBe(false);
    expect(findWeaponType('missile')?.locked).toBe(true);
    expect(findWeaponType('blackhole')?.locked).toBe(true);
  });

  it('defines chute and asteroids categories', () => {
    const ids = CATEGORY_DEFS.map((c) => c.id);
    expect(ids).toEqual(['chute', 'asteroids']);
  });

  it('every weapon type starts with count 1', () => {
    for (const w of WEAPON_TYPES) {
      expect(w.startCount).toBe(1);
    }
  });

  it('saw has at least one upgrade', () => {
    const saw = findWeaponType('saw')!;
    expect(saw.upgrades.length).toBeGreaterThan(0);
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
    expect(findCategory('chute')?.name).toBe('Chute');
    expect(findCategory('nope')).toBeUndefined();
  });
});
