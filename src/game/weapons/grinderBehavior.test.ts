import { describe, expect, it } from 'vitest';
import { computeBladeLayout } from './grinderBehavior';

describe('computeBladeLayout', () => {
  it('tiles blades across channel width with exact coverage', () => {
    const { n, actualWidth } = computeBladeLayout(240, 1);
    expect(n).toBe(Math.ceil(240 / 40));
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

  it('returns evenly-sized blades', () => {
    // Channel width 300, base blade 40 → ceil(300/40)=8 blades; actualWidth = 37.5.
    const { n, actualWidth } = computeBladeLayout(300, 1);
    expect(n).toBe(8);
    expect(actualWidth).toBeCloseTo(37.5, 5);
  });
});
