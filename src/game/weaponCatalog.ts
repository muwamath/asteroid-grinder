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

export const WEAPON_TYPES: readonly WeaponTypeDef[] = [
  {
    id: 'grinder',
    name: 'Grinder',
    icon: 'grinder',
    locked: false,
    startCount: 1,
    upgrades: [],
  },
  {
    id: 'saw',
    name: 'Saw',
    icon: 'saw',
    locked: false,
    startCount: 1,
    upgrades: [
      {
        id: 'saw.damage',
        name: 'Saw Damage',
        description: '+1 damage per saw hit',
        category: 'saw',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'saw.bladeCount',
        name: 'Blade Count',
        description: '+1 orbiting saw blade',
        category: 'saw',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 5,
      },
      {
        id: 'saw.spinSpeed',
        name: 'Spin Speed',
        description: 'Blades spin faster, pushing chunks along',
        category: 'saw',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 10,
      },
      {
        id: 'saw.orbitSpeed',
        name: 'Orbit Speed',
        description: 'Blades sweep around the arbor faster',
        category: 'saw',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 10,
      },
      {
        id: 'saw.bladeSize',
        name: 'Blade Size',
        description: 'Bigger blades, wider damage zone',
        category: 'saw',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 8,
      },
    ],
  },
  {
    id: 'laser',
    name: 'Laser',
    icon: 'laser',
    locked: false,
    startCount: 1,
    upgrades: [
      {
        id: 'laser.aimSpeed',
        name: 'Aim Speed',
        description: 'Turret rotates to targets faster',
        category: 'laser',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'laser.range',
        name: 'Range',
        description: 'Beam reaches further',
        category: 'laser',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'laser.damage',
        name: 'Damage',
        description: 'More DPS while firing',
        category: 'laser',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'laser.cooldown',
        name: 'Cooldown',
        description: 'Less delay between targets',
        category: 'laser',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
    ],
  },
  {
    id: 'missile',
    name: 'Missile',
    icon: 'missile',
    locked: false,
    startCount: 1,
    upgrades: [
      {
        id: 'missile.fireRate',
        name: 'Fire Rate',
        description: 'Fires missiles more often',
        category: 'missile',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'missile.damage',
        name: 'Damage',
        description: 'More AOE damage per missile',
        category: 'missile',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'missile.blastRadius',
        name: 'Blast Radius',
        description: 'Bigger explosion area',
        category: 'missile',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'missile.speed',
        name: 'Speed',
        description: 'Missiles fly faster',
        category: 'missile',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'missile.homing',
        name: 'Homing',
        description: 'Missiles track targets in flight',
        category: 'missile',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 10,
      },
    ],
  },
  {
    id: 'blackhole',
    name: 'B. Hole',
    icon: 'blackhole',
    locked: false,
    startCount: 1,
    upgrades: [
      {
        id: 'blackhole.pullRange',
        name: 'Pull Range',
        description: 'Gravity field reaches further',
        category: 'blackhole',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'blackhole.pullForce',
        name: 'Pull Force',
        description: 'Stronger gravity (attracts live, repels dead)',
        category: 'blackhole',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'blackhole.coreSize',
        name: 'Core Size',
        description: 'Wider inner damage zone',
        category: 'blackhole',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'blackhole.coreDamage',
        name: 'Core Damage',
        description: 'More DPS in the core zone',
        category: 'blackhole',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
      {
        id: 'blackhole.maxTargets',
        name: 'Max Targets',
        description: 'Affect more chunks at once',
        category: 'blackhole',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 10,
      },
    ],
  },
];

export const CATEGORY_DEFS: readonly CategoryDef[] = [
  {
    id: 'chute',
    name: 'Chute',
    icon: 'chute',
    upgrades: [
      {
        id: 'chute.channelWidth',
        name: 'Channel Width',
        description: 'Widen the grind channel',
        category: 'chute',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 10,
      },
    ],
  },
  {
    id: 'asteroids',
    name: 'Asteroids',
    icon: 'asteroids',
    upgrades: [
      {
        id: 'asteroids.dropRate',
        name: 'Drop Rate',
        description: 'Asteroids spawn faster',
        category: 'asteroids',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 10,
      },
      {
        id: 'asteroids.chunkHp',
        name: 'Chunk HP',
        description: '+1 HP per chunk, bigger kill payout',
        category: 'asteroids',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 10,
      },
      {
        id: 'asteroids.asteroidSize',
        name: 'Asteroid Size',
        description: '+2 chunks per asteroid',
        category: 'asteroids',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 8,
      },
      {
        id: 'asteroids.quality',
        name: 'Asteroid Quality',
        description: 'Unlocks and weights higher-tier materials',
        category: 'asteroids',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 9,
      },
      {
        id: 'asteroids.fallSpeed',
        name: 'Fall Speed',
        description: 'Asteroids fall faster',
        category: 'asteroids',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 9,
      },
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
