export interface EffectiveGameplayParams {
  readonly sawDamage: number;
  readonly bladeCount: number;
  readonly channelHalfWidth: number;
  readonly spawnIntervalMs: number;
  readonly maxHpPerChunk: number;
  readonly minChunks: number;
  readonly maxChunks: number;
}

// Level-0 defaults. Each upgrade adds to these via applyUpgrades.
export const BASE_PARAMS: EffectiveGameplayParams = {
  sawDamage: 1,
  bladeCount: 1,
  channelHalfWidth: 80,
  spawnIntervalMs: 1800,
  maxHpPerChunk: 3,
  minChunks: 9,
  maxChunks: 14,
};

// Per-level deltas. Tuning scaffolding — adjust after playtesting.
const SAW_DAMAGE_PER_LEVEL = 1;
const BLADE_COUNT_PER_LEVEL = 1;
const CHANNEL_WIDTH_PER_LEVEL = 14;
const DROP_RATE_MS_PER_LEVEL = 130;
const DROP_RATE_MIN_MS = 300;
const CHUNK_HP_PER_LEVEL = 1;
const ASTEROID_SIZE_PER_LEVEL = 2;

export function applyUpgrades(
  levels: Readonly<Record<string, number>>,
): EffectiveGameplayParams {
  const lv = (id: string): number => levels[id] ?? 0;

  return {
    sawDamage: BASE_PARAMS.sawDamage + lv('saw.damage') * SAW_DAMAGE_PER_LEVEL,
    bladeCount: BASE_PARAMS.bladeCount + lv('saw.bladeCount') * BLADE_COUNT_PER_LEVEL,
    channelHalfWidth:
      BASE_PARAMS.channelHalfWidth + lv('chute.channelWidth') * CHANNEL_WIDTH_PER_LEVEL,
    spawnIntervalMs: Math.max(
      DROP_RATE_MIN_MS,
      BASE_PARAMS.spawnIntervalMs - lv('asteroids.dropRate') * DROP_RATE_MS_PER_LEVEL,
    ),
    maxHpPerChunk: BASE_PARAMS.maxHpPerChunk + lv('asteroids.chunkHp') * CHUNK_HP_PER_LEVEL,
    minChunks: BASE_PARAMS.minChunks + lv('asteroids.asteroidSize') * ASTEROID_SIZE_PER_LEVEL,
    maxChunks: BASE_PARAMS.maxChunks + lv('asteroids.asteroidSize') * ASTEROID_SIZE_PER_LEVEL,
  };
}
