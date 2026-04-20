import type { UpgradeDef } from './upgradeCatalog';

export interface WeaponTypeDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly upgrades: readonly UpgradeDef[];
  readonly startCount: number;
  readonly locked: boolean;
}

export interface CategoryDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly upgrades: readonly UpgradeDef[];
}

const INF = Number.POSITIVE_INFINITY;

export const WEAPON_TYPES: readonly WeaponTypeDef[] = [
  {
    id: 'grinder',
    name: 'Grinder',
    icon: 'grinder',
    locked: false,
    startCount: 1,
    upgrades: [
      { id: 'grinder.damage',    name: 'Grinder Damage', description: '+damage per blade contact',    category: 'grinder', baseCost: 15,  growthRate: 1.25, maxLevel: INF },
      { id: 'grinder.spinSpeed', name: 'Spin Speed',     description: 'Blades spin faster',           category: 'grinder', baseCost: 40,  growthRate: 1.35, maxLevel: 15 },
      { id: 'grinder.bladeSize', name: 'Blade Size',     description: 'Taller blades reach higher',   category: 'grinder', baseCost: 100, growthRate: 1.50, maxLevel: 10 },
    ],
  },
  {
    id: 'saw',
    name: 'Saw',
    icon: 'saw',
    locked: false,
    startCount: 0,
    upgrades: [
      { id: 'saw.damage',     name: 'Saw Damage',  description: '+1 damage per saw hit',                          category: 'saw', baseCost: 15,    growthRate: 1.25, maxLevel: INF },
      { id: 'saw.bladeCount', name: 'Blade Count', description: '+1 orbiting saw blade',                          category: 'saw', baseCost: 2500,  growthRate: 4.00, maxLevel: 5 },
      { id: 'saw.spinSpeed',  name: 'Spin Speed',  description: 'Blades spin faster, pushing chunks along',       category: 'saw', baseCost: 25,    growthRate: 1.30, maxLevel: 10 },
      { id: 'saw.orbitSpeed', name: 'Orbit Speed', description: 'Blades sweep around the arbor faster',           category: 'saw', baseCost: 30,    growthRate: 1.30, maxLevel: INF },
      { id: 'saw.bladeSize',  name: 'Blade Size',  description: 'Bigger blades, wider damage zone',               category: 'saw', baseCost: 500,   growthRate: 1.80, maxLevel: 8 },
    ],
  },
  {
    id: 'laser',
    name: 'Laser',
    icon: 'laser',
    locked: false,
    startCount: 0,
    upgrades: [
      { id: 'laser.aimSpeed', name: 'Aim Speed', description: 'Turret rotates to targets faster', category: 'laser', baseCost: 30, growthRate: 1.30, maxLevel: 20 },
      { id: 'laser.range',    name: 'Range',     description: 'Beam reaches further',              category: 'laser', baseCost: 20, growthRate: 1.25, maxLevel: INF },
      { id: 'laser.damage',   name: 'Damage',    description: 'More DPS while firing',             category: 'laser', baseCost: 15, growthRate: 1.25, maxLevel: INF },
      { id: 'laser.cooldown', name: 'Cooldown',  description: 'Less delay between targets',        category: 'laser', baseCost: 25, growthRate: 1.30, maxLevel: 20 },
    ],
  },
  {
    id: 'missile',
    name: 'Missile',
    icon: 'missile',
    locked: false,
    startCount: 1,
    upgrades: [
      { id: 'missile.fireRate',    name: 'Fire Rate',    description: 'Fires missiles more often',     category: 'missile', baseCost: 100, growthRate: 1.40, maxLevel: 20 },
      { id: 'missile.damage',      name: 'Damage',       description: 'More AOE damage per missile',   category: 'missile', baseCost: 150, growthRate: 1.50, maxLevel: INF },
      { id: 'missile.blastRadius', name: 'Blast Radius', description: 'Bigger explosion area',         category: 'missile', baseCost: 200, growthRate: 1.60, maxLevel: INF },
      { id: 'missile.speed',       name: 'Speed',        description: 'Missiles fly faster',           category: 'missile', baseCost: 25,  growthRate: 1.30, maxLevel: INF },
      { id: 'missile.homing',      name: 'Homing',       description: 'Missiles track targets in flight', category: 'missile', baseCost: 30, growthRate: 1.30, maxLevel: 10 },
    ],
  },
  {
    id: 'blackhole',
    name: 'B. Hole',
    icon: 'blackhole',
    locked: false,
    startCount: 0,
    upgrades: [
      { id: 'blackhole.pullRange',  name: 'Pull Range',  description: 'Gravity field reaches further',                 category: 'blackhole', baseCost: 100, growthRate: 1.40, maxLevel: INF },
      { id: 'blackhole.pullForce',  name: 'Pull Force',  description: 'Stronger gravity (attracts live, repels dead)', category: 'blackhole', baseCost: 80,  growthRate: 1.40, maxLevel: INF },
      { id: 'blackhole.coreSize',   name: 'Core Size',   description: 'Wider inner damage zone',                       category: 'blackhole', baseCost: 200, growthRate: 1.55, maxLevel: INF },
      { id: 'blackhole.coreDamage', name: 'Core Damage', description: 'More DPS in the core zone',                     category: 'blackhole', baseCost: 150, growthRate: 1.50, maxLevel: INF },
      { id: 'blackhole.maxTargets', name: 'Max Targets', description: 'Affect more chunks at once',                    category: 'blackhole', baseCost: 300, growthRate: 1.70, maxLevel: 20 },
    ],
  },
];

export const CATEGORY_DEFS: readonly CategoryDef[] = [
  {
    id: 'asteroids',
    name: 'Asteroids',
    icon: 'asteroids',
    upgrades: [
      { id: 'asteroids.chunkHp',      name: 'Chunk HP',       description: 'HP multiplier per chunk (also scales reward)', category: 'asteroids', baseCost: 15,  growthRate: 1.25, maxLevel: INF },
      { id: 'asteroids.asteroidSize', name: 'Asteroid Size',  description: '+2 chunks per asteroid',                       category: 'asteroids', baseCost: 100, growthRate: 1.50, maxLevel: 20 },
      { id: 'asteroids.quality',      name: 'Asteroid Quality', description: 'Unlocks and weights higher-tier materials', category: 'asteroids', baseCost: 150, growthRate: 1.55, maxLevel: 8 },
      { id: 'asteroids.fallSpeed',    name: 'Fall Speed',     description: 'Asteroids fall faster',                        category: 'asteroids', baseCost: 50,  growthRate: 1.35, maxLevel: 9 },
    ],
  },
  {
    id: 'spawn',
    name: 'Spawner',
    icon: 'spawner',
    upgrades: [
      { id: 'spawn.rate',      name: 'Spawn Rate',      description: 'Asteroids spawn faster',    category: 'spawn', baseCost: 200, growthRate: 2.20, maxLevel: 12 },
      { id: 'spawn.amplitude', name: 'Spawn Amplitude', description: 'Spawner sweeps a wider arc', category: 'spawn', baseCost: 80,  growthRate: 1.50, maxLevel: 10 },
    ],
  },
];

export function findWeaponType(id: string): WeaponTypeDef | undefined {
  return WEAPON_TYPES.find((w) => w.id === id);
}

export function findCategory(id: string): CategoryDef | undefined {
  return CATEGORY_DEFS.find((c) => c.id === id);
}

export function allUpgradeDefs(): UpgradeDef[] {
  const result: UpgradeDef[] = [];
  for (const w of WEAPON_TYPES) result.push(...w.upgrades);
  for (const c of CATEGORY_DEFS) result.push(...c.upgrades);
  return result;
}

export function findUpgrade(id: string): UpgradeDef | undefined {
  return allUpgradeDefs().find((u) => u.id === id);
}

export interface WeaponBuyCostArgs {
  readonly globalBought: number;        // total non-grinder weapons bought this run
  readonly typeBought: number;          // count of THIS type bought this run
  readonly freeSlotsForType: number;    // prestige free.<type> level
}

/**
 * Global Nth-weapon purchase curve (audit 2026-04-19, rebased 2026-04-19 ×1/10).
 * - 1st purchase is always $0 — every run has at least one weapon.
 * - N >= 2: cost = 100 * 3^(N-2).
 * - Prestige `free.<type>` grants $0 on purchases #1..N of that type (up to
 *   freeSlotsForType); those purchases still increment globalBought so the
 *   global curve is not exploitable.
 */
export function weaponBuyCost({ globalBought, typeBought, freeSlotsForType }: WeaponBuyCostArgs): number {
  if (typeBought < freeSlotsForType) return 0;
  const N = globalBought + 1;
  if (N <= 1) return 0;
  return Math.floor(100 * Math.pow(3, N - 2));
}
