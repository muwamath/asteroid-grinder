import { describe, it, expect } from 'vitest';
import { computeChunkReward } from './rewardFormula';

describe('computeChunkReward', () => {
  it('grinder kills pay flat $1 × cashMultiplier, ignoring tier and hpMultiplier', () => {
    expect(computeChunkReward({ tier: 1, hpMultiplier: 1, killerType: 'grinder', cashMultiplier: 1 })).toBe(1);
    expect(computeChunkReward({ tier: 9, hpMultiplier: 5, killerType: 'grinder', cashMultiplier: 1 })).toBe(1);
    expect(computeChunkReward({ tier: 9, hpMultiplier: 5, killerType: 'grinder', cashMultiplier: 3 })).toBe(3);
  });

  it('non-grinder kills pay tier × hpMultiplier × cashMultiplier (floored, min 1)', () => {
    expect(computeChunkReward({ tier: 5, hpMultiplier: 1, killerType: 'saw',      cashMultiplier: 1 })).toBe(5);
    expect(computeChunkReward({ tier: 5, hpMultiplier: 3, killerType: 'saw',      cashMultiplier: 1 })).toBe(15);
    expect(computeChunkReward({ tier: 5, hpMultiplier: 3, killerType: 'laser',    cashMultiplier: 2 })).toBe(30);
    expect(computeChunkReward({ tier: 3, hpMultiplier: 2, killerType: 'missile',  cashMultiplier: 1.5 })).toBe(9);
    expect(computeChunkReward({ tier: 4, hpMultiplier: 2, killerType: 'blackhole', cashMultiplier: 1 })).toBe(8);
  });

  it('returns at least 1 when rounding underflows', () => {
    expect(computeChunkReward({ tier: 1, hpMultiplier: 0.1, killerType: 'saw', cashMultiplier: 0.5 })).toBe(1);
  });
});
