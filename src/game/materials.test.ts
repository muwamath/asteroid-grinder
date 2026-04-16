import { describe, expect, it } from 'vitest';
import { MATERIALS, materialByTier, materialByName, chooseMaterial, materialDistribution, fallSpeedMultiplier } from './materials';
import { SeededRng } from './rng';

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

describe('materialDistribution', () => {
  it('at quality 0, only Dirt (tier 1) has nonzero probability', () => {
    const d = materialDistribution(0);
    expect(d[0]).toBeCloseTo(1.0, 6);
    for (let i = 1; i < 9; i++) expect(d[i]).toBe(0);
  });

  it('at quality 1, Dirt ~59% / Stone ~41%', () => {
    const d = materialDistribution(1);
    expect(d[0]).toBeCloseTo(1 / 1.7, 3);
    expect(d[1]).toBeCloseTo(0.7 / 1.7, 3);
    for (let i = 2; i < 9; i++) expect(d[i]).toBe(0);
  });

  it('at quality 8, all 9 tiers appear and diamond is smallest', () => {
    const d = materialDistribution(8);
    d.forEach((p) => expect(p).toBeGreaterThan(0));
    expect(d[8]).toBeLessThan(d[0]);
    expect(d[8]).toBeCloseTo(Math.pow(0.7, 8) / ((1 - Math.pow(0.7, 9)) / (1 - 0.7)), 3);
  });

  it('clamps quality above 8 to the same max distribution', () => {
    const d8 = materialDistribution(8);
    const d99 = materialDistribution(99);
    expect(d99).toEqual(d8);
  });

  it('all distributions sum to ~1', () => {
    for (let q = 0; q <= 8; q++) {
      const sum = materialDistribution(q).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    }
  });
});

describe('chooseMaterial', () => {
  it('at quality 0 always returns dirt', () => {
    const rng = new SeededRng(1);
    for (let i = 0; i < 20; i++) {
      expect(chooseMaterial(0, rng).name).toBe('dirt');
    }
  });

  it('at quality 8 produces all 9 materials over many rolls', () => {
    const rng = new SeededRng(42);
    const counts = new Map<string, number>();
    for (let i = 0; i < 5000; i++) {
      const m = chooseMaterial(8, rng);
      counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    expect((counts.get('diamond') ?? 0)).toBeGreaterThan(50);
  });

  it('is deterministic for the same seed', () => {
    const a = new SeededRng(7);
    const b = new SeededRng(7);
    for (let i = 0; i < 50; i++) {
      expect(chooseMaterial(5, a).name).toBe(chooseMaterial(5, b).name);
    }
  });
});

describe('fallSpeedMultiplier', () => {
  it('L0 = 0.03×', () => {
    expect(fallSpeedMultiplier(0)).toBeCloseTo(0.03, 6);
  });
  it('L9 = 0.93×', () => {
    expect(fallSpeedMultiplier(9)).toBeCloseTo(0.93, 6);
  });
  it('linear +0.10 per level', () => {
    expect(fallSpeedMultiplier(3)).toBeCloseTo(0.33, 6);
    expect(fallSpeedMultiplier(5)).toBeCloseTo(0.53, 6);
  });
  it('clamps negative levels to L0 minimum', () => {
    expect(fallSpeedMultiplier(-5)).toBeCloseTo(0.03, 6);
  });
});
