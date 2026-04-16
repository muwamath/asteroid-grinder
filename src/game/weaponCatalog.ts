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
    ],
  },
  {
    id: 'laser',
    name: 'Laser',
    icon: 'laser',
    locked: true,
    startCount: 1,
    upgrades: [],
  },
  {
    id: 'missile',
    name: 'Missile',
    icon: 'missile',
    locked: true,
    startCount: 1,
    upgrades: [],
  },
  {
    id: 'blackhole',
    name: 'B. Hole',
    icon: 'blackhole',
    locked: true,
    startCount: 1,
    upgrades: [],
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
