import { fallSpeedMultiplier as fallSpeedMultiplierFn } from './materials';

export interface EffectiveGameplayParams {
  readonly sawDamage: number;
  readonly bladeCount: number;
  readonly channelHalfWidth: number;
  readonly spawnIntervalMs: number;
  readonly maxHpPerChunk: number;
  readonly minChunks: number;
  readonly maxChunks: number;
  readonly bladeSpinSpeed: number;
  readonly orbitSpeed: number;
  readonly bladeRadius: number;
  readonly laserAimSpeed: number;
  readonly laserRange: number;
  readonly laserDamage: number;
  readonly laserCooldown: number;
  readonly missileFireInterval: number;
  readonly missileDamage: number;
  readonly missileBlastRadius: number;
  readonly missileSpeed: number;
  readonly missileHoming: number;
  readonly blackholePullRange: number;
  readonly blackholePullForce: number;
  readonly blackholeCoreSize: number;
  readonly blackholeCoreDamage: number;
  readonly blackholeMaxTargets: number;
  readonly qualityLevel: number;
  readonly fallSpeedMultiplier: number;
}

// Level-0 defaults. Each upgrade adds to these via applyUpgrades.
export const BASE_PARAMS: EffectiveGameplayParams = {
  sawDamage: 1,
  bladeCount: 1,
  channelHalfWidth: 44,
  spawnIntervalMs: 1800,
  maxHpPerChunk: 1,
  minChunks: 9,
  maxChunks: 14,
  bladeSpinSpeed: 0.005,
  orbitSpeed: 1,
  bladeRadius: 6,
  laserAimSpeed: 30,
  laserRange: 60,
  laserDamage: 1,
  laserCooldown: 2,
  missileFireInterval: 5,
  missileDamage: 2,
  missileBlastRadius: 20,
  missileSpeed: 80,
  missileHoming: 0,
  blackholePullRange: 60,
  blackholePullForce: 0.0003,
  blackholeCoreSize: 15,
  blackholeCoreDamage: 1,
  blackholeMaxTargets: 3,
  qualityLevel: 0,
  fallSpeedMultiplier: 0.03,
};

// Per-level deltas. Tuning scaffolding — adjust after playtesting.
const SAW_DAMAGE_PER_LEVEL = 1;
const BLADE_COUNT_PER_LEVEL = 1;
const CHANNEL_WIDTH_PER_LEVEL = 14;
const DROP_RATE_MS_PER_LEVEL = 130;
const DROP_RATE_MIN_MS = 300;
const CHUNK_HP_PER_LEVEL = 1;
const ASTEROID_SIZE_PER_LEVEL = 2;
const BLADE_SPIN_SPEED_PER_LEVEL = 0.005;
const ORBIT_SPEED_PER_LEVEL = 0.6;
const BLADE_RADIUS_PER_LEVEL = 2;
const LASER_AIM_SPEED_PER_LEVEL = 16.5;
const LASER_RANGE_PER_LEVEL = 20;
const LASER_DAMAGE_PER_LEVEL = 0.5;
const LASER_COOLDOWN_PER_LEVEL = 0.095;
const LASER_MIN_COOLDOWN = 0.1;
const MISSILE_FIRE_INTERVAL_PER_LEVEL = 0.225;
const MISSILE_MIN_FIRE_INTERVAL = 0.5;
const MISSILE_DAMAGE_PER_LEVEL = 1.5;
const MISSILE_BLAST_RADIUS_PER_LEVEL = 4;
const MISSILE_SPEED_PER_LEVEL = 12;
const MISSILE_HOMING_PER_LEVEL = 0.5;
const BLACKHOLE_PULL_RANGE_PER_LEVEL = 8;
const BLACKHOLE_PULL_FORCE_PER_LEVEL = 0.00015;
const BLACKHOLE_CORE_SIZE_PER_LEVEL = 3;
const BLACKHOLE_CORE_DAMAGE_PER_LEVEL = 0.5;
const BLACKHOLE_MAX_TARGETS_PER_LEVEL = 1;

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
    bladeSpinSpeed: BASE_PARAMS.bladeSpinSpeed + lv('saw.spinSpeed') * BLADE_SPIN_SPEED_PER_LEVEL,
    orbitSpeed: BASE_PARAMS.orbitSpeed + lv('saw.orbitSpeed') * ORBIT_SPEED_PER_LEVEL,
    bladeRadius: BASE_PARAMS.bladeRadius + lv('saw.bladeSize') * BLADE_RADIUS_PER_LEVEL,
    laserAimSpeed: BASE_PARAMS.laserAimSpeed + lv('laser.aimSpeed') * LASER_AIM_SPEED_PER_LEVEL,
    laserRange: BASE_PARAMS.laserRange + lv('laser.range') * LASER_RANGE_PER_LEVEL,
    laserDamage: BASE_PARAMS.laserDamage + lv('laser.damage') * LASER_DAMAGE_PER_LEVEL,
    laserCooldown: Math.max(
      LASER_MIN_COOLDOWN,
      BASE_PARAMS.laserCooldown - lv('laser.cooldown') * LASER_COOLDOWN_PER_LEVEL,
    ),
    missileFireInterval: Math.max(
      MISSILE_MIN_FIRE_INTERVAL,
      BASE_PARAMS.missileFireInterval - lv('missile.fireRate') * MISSILE_FIRE_INTERVAL_PER_LEVEL,
    ),
    missileDamage: BASE_PARAMS.missileDamage + lv('missile.damage') * MISSILE_DAMAGE_PER_LEVEL,
    missileBlastRadius: BASE_PARAMS.missileBlastRadius + lv('missile.blastRadius') * MISSILE_BLAST_RADIUS_PER_LEVEL,
    missileSpeed: BASE_PARAMS.missileSpeed + lv('missile.speed') * MISSILE_SPEED_PER_LEVEL,
    missileHoming: BASE_PARAMS.missileHoming + lv('missile.homing') * MISSILE_HOMING_PER_LEVEL,
    blackholePullRange: BASE_PARAMS.blackholePullRange + lv('blackhole.pullRange') * BLACKHOLE_PULL_RANGE_PER_LEVEL,
    blackholePullForce: BASE_PARAMS.blackholePullForce + lv('blackhole.pullForce') * BLACKHOLE_PULL_FORCE_PER_LEVEL,
    blackholeCoreSize: BASE_PARAMS.blackholeCoreSize + lv('blackhole.coreSize') * BLACKHOLE_CORE_SIZE_PER_LEVEL,
    blackholeCoreDamage: BASE_PARAMS.blackholeCoreDamage + lv('blackhole.coreDamage') * BLACKHOLE_CORE_DAMAGE_PER_LEVEL,
    blackholeMaxTargets: BASE_PARAMS.blackholeMaxTargets + lv('blackhole.maxTargets') * BLACKHOLE_MAX_TARGETS_PER_LEVEL,
    qualityLevel: lv('asteroids.quality'),
    fallSpeedMultiplier: fallSpeedMultiplierFn(lv('asteroids.fallSpeed')),
  };
}
