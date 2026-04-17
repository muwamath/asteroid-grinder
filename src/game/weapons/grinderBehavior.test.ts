import { describe, expect, it } from 'vitest';
import { computeBladeLayout } from './grinderBehavior';

describe('computeBladeLayout', () => {
  it('tiles blades across channel width with exact coverage', () => {
    const { n, actualWidth } = computeBladeLayout(240, 1);
    expect(n).toBeGreaterThan(1);
    expect(actualWidth * n).toBeCloseTo(240, 5);
  });

  it('scales blade count with channel width', () => {
    const narrow = computeBladeLayout(80, 1);
    const wide = computeBladeLayout(400, 1);
    expect(wide.n).toBeGreaterThan(narrow.n);
  });

  it('honors bladeScale — larger blades, fewer of them', () => {
    const small = computeBladeLayout(240, 1);
    const big = computeBladeLayout(240, 2);
    expect(big.n).toBeLessThanOrEqual(small.n);
  });

  it('always returns at least 1 blade even for zero width', () => {
    expect(computeBladeLayout(0, 1).n).toBe(1);
  });

  it('returns evenly-sized blades that sum to the channel width', () => {
    const { n, actualWidth } = computeBladeLayout(300, 1);
    expect(actualWidth * n).toBeCloseTo(300, 5);
    expect(actualWidth).toBeLessThanOrEqual(16); // never wider than base
  });
});
