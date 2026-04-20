import type { EffectiveGameplayParams } from './upgradeApplier';

const H = 60 * 60 * 1000;
const OFFLINE_CAP_TIERS = [8 * H, 12 * H, 24 * H, 48 * H];

/**
 * Overlay prestige-shop effects onto an EffectiveGameplayParams computed from
 * in-run upgrade levels. Applies damage multiplier to raw per-weapon damage
 * fields so call sites don't need to remember to multiply.
 */
export function applyPrestigeEffects(
  params: EffectiveGameplayParams,
  shopLevels: Readonly<Record<string, number>>,
): EffectiveGameplayParams {
  const lv = (id: string): number => shopLevels[id] ?? 0;

  const damageMultiplier = 1 + 0.05 * lv('mult.damage');
  const offlineIdx = Math.max(0, Math.min(OFFLINE_CAP_TIERS.length - 1, lv('offline.cap')));

  return {
    ...params,
    sawDamage: params.sawDamage * damageMultiplier,
    laserDamage: params.laserDamage * damageMultiplier,
    missileDamage: params.missileDamage * damageMultiplier,
    blackholeCoreDamage: params.blackholeCoreDamage * damageMultiplier,
    grinderDamage: params.grinderDamage * damageMultiplier,
    cashMultiplier: 1 + 0.10 * lv('mult.cash'),
    damageMultiplier,
    upgradeCostMultiplier: Math.max(0.5, 1 - 0.05 * lv('discount.upgrade')),
    fillerFraction: Math.max(0.5, 0.8 - 0.05 * lv('refinement')),
    offlineCapMs: OFFLINE_CAP_TIERS[offlineIdx],
    shardYieldBonus: lv('shard.yield'),
    shardYieldMultiplier: 1 + 0.05 * lv('prestige.shardMultiplier'),
    offlineRateMultiplier: 1 + 0.15 * lv('offline.rate'),
    freeSlotCount: {
      saw: lv('free.saw'),
      laser: lv('free.laser'),
      missile: lv('free.missile'),
      blackhole: lv('free.blackhole'),
    },
    startingCash: 50 * lv('start.cash'),
  };
}
