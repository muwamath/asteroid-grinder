import { describe, expect, it } from 'vitest';
import { MATERIALS, materialByTier, materialByName } from './materials';

describe('MATERIALS ladder', () => {
  it('has 9 tiers in ascending order 1..9', () => {
    expect(MATERIALS).toHaveLength(9);
    MATERIALS.forEach((m, i) => expect(m.tier).toBe(i + 1));
  });

  it('has the expected names in order', () => {
    expect(MATERIALS.map((m) => m.name)).toEqual([
      'dirt', 'stone', 'copper', 'silver', 'gold',
      'ruby', 'emerald', 'sapphire', 'diamond',
    ]);
  });

  it('bands correctly group Earth / Metal / Gem', () => {
    const bands = MATERIALS.map((m) => m.band);
    expect(bands.slice(0, 2)).toEqual(['earth', 'earth']);
    expect(bands.slice(2, 5)).toEqual(['metal', 'metal', 'metal']);
    expect(bands.slice(5, 9)).toEqual(['gem', 'gem', 'gem', 'gem']);
  });

  it('only gems have hasGlow=true', () => {
    for (const m of MATERIALS) {
      expect(m.hasGlow).toBe(m.band === 'gem');
    }
  });

  it('materialByTier looks up by tier number', () => {
    expect(materialByTier(1)?.name).toBe('dirt');
    expect(materialByTier(9)?.name).toBe('diamond');
    expect(materialByTier(0)).toBeUndefined();
    expect(materialByTier(10)).toBeUndefined();
  });

  it('materialByName looks up by name', () => {
    expect(materialByName('copper')?.tier).toBe(3);
    expect(materialByName('nope')).toBeUndefined();
  });
});
