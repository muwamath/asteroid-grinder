import { describe, it, expect } from 'vitest';
import { CashRateTracker } from './cashRate';

describe('CashRateTracker', () => {
  it('starts at zero', () => {
    expect(new CashRateTracker().rate()).toBe(0);
  });

  it('converges toward steady-state with repeated observations', () => {
    const t = new CashRateTracker(60_000);
    for (let i = 0; i < 120; i++) t.observe(10, 1000);
    expect(t.rate()).toBeGreaterThan(5);
    expect(t.rate()).toBeLessThan(15);
  });

  it('decays toward zero when idle', () => {
    const t = new CashRateTracker(60_000);
    for (let i = 0; i < 60; i++) t.observe(10, 1000);
    const before = t.rate();
    for (let i = 0; i < 300; i++) t.observe(0, 1000);
    expect(t.rate()).toBeLessThan(before);
  });

  it('restores from saved rate', () => {
    expect(new CashRateTracker(60_000, 7.5).rate()).toBe(7.5);
  });

  it('ignores non-positive deltaMs', () => {
    const t = new CashRateTracker();
    t.observe(100, 0);
    t.observe(100, -5);
    expect(t.rate()).toBe(0);
  });
});
