import type { WeaponKillSource } from './compoundAsteroid';

export interface ChunkRewardArgs {
  readonly tier: number;
  readonly hpMultiplier: number;
  readonly killerType: WeaponKillSource;
  readonly cashMultiplier: number;
}

/**
 * Cash paid for a dead chunk as it crosses the death line.
 *
 * - Grinder kills: flat $1 × cashMultiplier (design invariant — grinder is
 *   cleanup, not reward-scaling; see DESIGN_INVARIANTS.md).
 * - All other kills: tier × hpMultiplier × cashMultiplier. Linking reward
 *   to hpMultiplier is what makes the `asteroids.chunkHp` upgrade non-dominated:
 *   leveling chunkHp makes chunks tougher AND proportionally richer.
 * - Minimum $1 to avoid rounding to zero on low-tier kills with heavy discounts.
 */
export function computeChunkReward({
  tier, hpMultiplier, killerType, cashMultiplier,
}: ChunkRewardArgs): number {
  const base = killerType === 'grinder' ? 1 : tier * hpMultiplier;
  return Math.max(1, Math.floor(base * cashMultiplier));
}
