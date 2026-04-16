export type UpgradeCategory = 'saw' | 'environment' | 'asteroid';

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: UpgradeCategory;
  readonly baseCost: number;
  readonly growthRate: number;
  readonly maxLevel: number;
}

// Starter catalog for Phase 3. These initial values are scaffolding — tune
// them once the full loop is playable.
export const UPGRADE_CATALOG: readonly UpgradeDef[] = [
  {
    id: 'sawDamage',
    name: 'Saw Damage',
    description: '+1 damage per saw hit',
    category: 'saw',
    baseCost: 20,
    growthRate: 1.5,
    maxLevel: 20,
  },
  {
    id: 'bladeCount',
    name: 'Blade Count',
    description: '+1 orbiting saw blade',
    category: 'saw',
    baseCost: 60,
    growthRate: 2.2,
    maxLevel: 5,
  },
  {
    id: 'channelWidth',
    name: 'Channel Width',
    description: 'Widen the grind channel',
    category: 'environment',
    baseCost: 35,
    growthRate: 1.7,
    maxLevel: 10,
  },
  {
    id: 'dropRate',
    name: 'Drop Rate',
    description: 'Asteroids spawn faster',
    category: 'asteroid',
    baseCost: 40,
    growthRate: 1.6,
    maxLevel: 10,
  },
  {
    id: 'chunkHp',
    name: 'Chunk HP',
    description: '+1 HP per chunk, bigger kill payout',
    category: 'asteroid',
    baseCost: 25,
    growthRate: 1.5,
    maxLevel: 10,
  },
  {
    id: 'asteroidSize',
    name: 'Asteroid Size',
    description: '+2 chunks per asteroid',
    category: 'asteroid',
    baseCost: 70,
    growthRate: 1.8,
    maxLevel: 8,
  },
];

export function findUpgrade(id: string): UpgradeDef | undefined {
  return UPGRADE_CATALOG.find((u) => u.id === id);
}

export function costAtLevel(def: UpgradeDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.growthRate, currentLevel));
}

export function isMaxed(def: UpgradeDef, currentLevel: number): boolean {
  return currentLevel >= def.maxLevel;
}
