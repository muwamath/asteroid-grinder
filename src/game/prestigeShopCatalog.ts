export type PrestigeFamily = 'free-weapon' | 'multiplier' | 'material' | 'economy';

export interface PrestigeShopEntry {
  readonly id: string;
  readonly family: PrestigeFamily;
  readonly name: string;
  readonly description: string;
  readonly baseCost: number;
  readonly growthRate: number;
  readonly maxLevel: number; // Infinity for unbounded
}

// Spec §3. All costs / growth rates are placeholders; tunable in one file.
export const PRESTIGE_SHOP: readonly PrestigeShopEntry[] = [
  { id: 'free.saw',         family: 'free-weapon', name: 'Free Saw',          description: 'First +1 Saw in-run costs $0',        baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'free.laser',       family: 'free-weapon', name: 'Free Laser',        description: 'First +1 Laser in-run costs $0',      baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'free.missile',     family: 'free-weapon', name: 'Free Missile',      description: 'First +1 Missile in-run costs $0',    baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'free.blackhole',   family: 'free-weapon', name: 'Free Blackhole',    description: 'First +1 Blackhole in-run costs $0',  baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'mult.cash',        family: 'multiplier',  name: 'Cash Multiplier',   description: '+10% cash earned globally per level', baseCost: 5,  growthRate: 1.4, maxLevel: Infinity },
  { id: 'mult.damage',      family: 'multiplier',  name: 'Damage Multiplier', description: '+5% weapon damage per level',         baseCost: 6,  growthRate: 1.4, maxLevel: Infinity },
  { id: 'discount.upgrade', family: 'multiplier',  name: 'Upgrade Discount',  description: '-5% in-run upgrade cost (cap -50%)',  baseCost: 8,  growthRate: 1.5, maxLevel: 10 },
  { id: 'refinement',       family: 'material',    name: 'Refinement',        description: 'Filler -5% per level (floor 50%)',    baseCost: 20, growthRate: 2.0, maxLevel: 6 },
  { id: 'offline.cap',      family: 'economy',     name: 'Offline Cap',       description: 'Offline cap: 8h → 12h → 24h → 48h',   baseCost: 25, growthRate: 3.0, maxLevel: 3 },
  { id: 'shard.yield',      family: 'economy',     name: 'Shard Yield',       description: '+1 Shard per vault core per level',   baseCost: 30, growthRate: 2.0, maxLevel: 5 },
  { id: 'start.cash',       family: 'economy',     name: 'Starting Cash',     description: '+$50 starting cash per level',        baseCost: 5,  growthRate: 1.5, maxLevel: Infinity },
  { id: 'arena.preUnlockedSlots', family: 'economy', name: 'Pre-Unlocked Slots', description: '+1 slot unlocked at run start per level', baseCost: 10, growthRate: 1.8, maxLevel: 9 /* MAX_SLOTS - 1 */ },
];

export function findShopEntry(id: string): PrestigeShopEntry | undefined {
  return PRESTIGE_SHOP.find((e) => e.id === id);
}

export function shopCostAtLevel(entry: PrestigeShopEntry, currentLevel: number): number {
  return Math.floor(entry.baseCost * Math.pow(entry.growthRate, currentLevel));
}

export function isShopMaxed(entry: PrestigeShopEntry, currentLevel: number): boolean {
  return currentLevel >= entry.maxLevel;
}
