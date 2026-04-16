export type { WeaponBehavior } from './weaponBehavior';
export { SawBehavior } from './sawBehavior';
export { LaserBehavior } from './laserBehavior';
export { MissileBehavior } from './missileBehavior';
export { BlackholeBehavior } from './blackholeBehavior';

import type { WeaponBehavior } from './weaponBehavior';
import { SawBehavior } from './sawBehavior';
import { LaserBehavior } from './laserBehavior';
import { MissileBehavior } from './missileBehavior';
import { BlackholeBehavior } from './blackholeBehavior';

const BEHAVIOR_FACTORIES: Record<string, () => WeaponBehavior> = {
  saw: () => new SawBehavior(),
  laser: () => new LaserBehavior(),
  missile: () => new MissileBehavior(),
  blackhole: () => new BlackholeBehavior(),
};

/** Create a fresh WeaponBehavior for the given weapon type id. */
export function createBehavior(typeId: string): WeaponBehavior | undefined {
  return BEHAVIOR_FACTORIES[typeId]?.();
}

/** All registered behavior singletons for texture preloading. */
export function allBehaviorPrototypes(): WeaponBehavior[] {
  return Object.values(BEHAVIOR_FACTORIES).map((f) => f());
}
