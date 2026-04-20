import { describe, it, expect } from 'vitest';
import { computeOfflineAward } from './offlineProgress';

const capMs = 8 * 60 * 60 * 1000;

describe('computeOfflineAward', () => {
  it('returns 0 for zero rate', () => {
    expect(computeOfflineAward({ rate: 0, elapsedMs: 3_600_000, capMs })).toBe(0);
  });

  it('returns rate * elapsed within cap', () => {
    expect(computeOfflineAward({ rate: 2, elapsedMs: 10_000, capMs })).toBe(20);
  });

  it('clamps elapsed at cap', () => {
    expect(computeOfflineAward({ rate: 1, elapsedMs: capMs * 10, capMs })).toBe(capMs / 1000);
  });

  it('returns 0 for negative/NaN inputs', () => {
    expect(computeOfflineAward({ rate: -1, elapsedMs: 1000, capMs })).toBe(0);
    expect(computeOfflineAward({ rate: NaN, elapsedMs: 1000, capMs })).toBe(0);
    expect(computeOfflineAward({ rate: 1, elapsedMs: -1, capMs })).toBe(0);
    expect(computeOfflineAward({ rate: 1, elapsedMs: NaN, capMs })).toBe(0);
  });

  it('floors to integer cash', () => {
    expect(computeOfflineAward({ rate: 1.7, elapsedMs: 3_500, capMs })).toBe(5);
  });

  it('rateMultiplier scales the effective rate before capping', () => {
    expect(computeOfflineAward({ rate: 10, elapsedMs: 1000, capMs: 10_000, rateMultiplier: 1 })).toBe(10);
    expect(computeOfflineAward({ rate: 10, elapsedMs: 1000, capMs: 10_000, rateMultiplier: 2 })).toBe(20);
    expect(computeOfflineAward({ rate: 10, elapsedMs: 1000, capMs: 10_000, rateMultiplier: 1.5 })).toBe(15);
  });
});
