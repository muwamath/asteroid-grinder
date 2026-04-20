import { describe, it, expect } from 'vitest';
import { computeVaultShardReward } from './prestigeAward';
import { materialByTier, type Material } from './materials';

describe('computeVaultShardReward', () => {
  it('returns material tier with zero shard-yield bonus', () => {
    const t9 = materialByTier(9)!;
    expect(computeVaultShardReward(t9, 0)).toBe(9);
  });

  it('adds shard-yield bonus per level', () => {
    const t6 = materialByTier(6)!;
    expect(computeVaultShardReward(t6, 3)).toBe(9);
  });

  it('returns 0 when material is null/undefined', () => {
    expect(computeVaultShardReward(null, 0)).toBe(0);
    expect(computeVaultShardReward(undefined, 2)).toBe(0);
  });

  it('negative bonus is clamped to 0', () => {
    const t3 = materialByTier(3)!;
    expect(computeVaultShardReward(t3, -5)).toBe(3);
  });

  it('shardYieldMultiplier scales the final shard count (floor)', () => {
    const t5 = { tier: 5 } as Material;
    expect(computeVaultShardReward(t5, 0, 1.0)).toBe(5);
    expect(computeVaultShardReward(t5, 0, 2.0)).toBe(10);
    expect(computeVaultShardReward(t5, 2, 1.5)).toBe(Math.floor(7 * 1.5)); // 10
  });
});
