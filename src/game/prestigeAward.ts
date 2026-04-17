import type { Material } from './materials';

/**
 * Shards dropped by a vault-core chunk on death.
 * Spec §2: shardsDropped = coreMaterial.tier + shardYieldBonus.
 * shardYieldBonus is the `shard.yield` prestige upgrade level (0–5).
 */
export function computeVaultShardReward(
  material: Material | null | undefined,
  shardYieldBonus: number,
): number {
  if (!material) return 0;
  return material.tier + Math.max(0, shardYieldBonus);
}
