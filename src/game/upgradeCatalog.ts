export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly baseCost: number;
  readonly growthRate: number;
  readonly maxLevel: number;
}

export function costAtLevel(def: UpgradeDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.growthRate, currentLevel));
}

export function isMaxed(def: UpgradeDef, currentLevel: number): boolean {
  return currentLevel >= def.maxLevel;
}
