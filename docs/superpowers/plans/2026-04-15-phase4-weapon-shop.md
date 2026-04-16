# Phase 4 — Weapon Shop & Multi-Instance Weapons: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-stopper model with a weapon-centric shop where players buy, sell, and upgrade multiple draggable weapon instances (Grinder + Saw), with a new left-side weapon bar UI.

**Architecture:** Incremental refactor. Extract weapon/category definitions into a new registry (`weaponCatalog.ts`), add weapon count tracking to `gameplayState`, refactor `GameScene` from single stopper to `WeaponInstance[]`, and replace the flat upgrade panel in `UIScene` with the weapon-bar + sub-panel layout. Grinder and Saw are the two active weapon types; Laser/Missile/Black Hole appear as locked visual placeholders.

**Tech Stack:** Phaser 3, Matter.js, TypeScript, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/game/weaponCatalog.ts` | Static registry of weapon types + category defs, replaces `UPGRADE_CATALOG` |
| Modify | `src/game/upgradeCatalog.ts` | Keep `UpgradeDef`, `costAtLevel`, `isMaxed`; remove `UPGRADE_CATALOG` array and `UpgradeCategory` type |
| Modify | `src/game/upgradeApplier.ts` | Update key lookup to dotted prefix (`saw.damage` instead of `sawDamage`) |
| Modify | `src/game/gameplayState.ts` | Add weapon count tracking + `weaponCountChanged` event |
| Modify | `src/scenes/GameScene.ts` | Replace single stopper with `WeaponInstance[]`, multi-instance update loop |
| Modify | `src/scenes/UIScene.ts` | Replace flat upgrade panel with weapon bar + sub-panel |
| Modify | `src/game/upgradeApplier.test.ts` | Update tests for new dotted-prefix key scheme |
| Modify | `src/game/gameplayState.test.ts` (in `upgradeApplier.test.ts`) | Add weapon count tests |

---

### Task 1: Weapon & Category Registry

**Files:**
- Create: `src/game/weaponCatalog.ts`
- Modify: `src/game/upgradeCatalog.ts` (remove `UPGRADE_CATALOG` array, `UpgradeCategory`, `findUpgrade`)
- Modify: `src/game/upgradeApplier.test.ts:49-82` (update catalog tests)

- [ ] **Step 1: Write tests for the new weapon catalog**

Create `src/game/weaponCatalog.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  WEAPON_TYPES,
  CATEGORY_DEFS,
  findWeaponType,
  findCategory,
  allUpgradeDefs,
  findUpgrade,
} from './weaponCatalog';

describe('weaponCatalog', () => {
  it('defines grinder and saw as unlocked weapon types', () => {
    const ids = WEAPON_TYPES.map((w) => w.id);
    expect(ids).toContain('grinder');
    expect(ids).toContain('saw');
    expect(findWeaponType('grinder')?.locked).toBe(false);
    expect(findWeaponType('saw')?.locked).toBe(false);
  });

  it('defines laser, missile, blackhole as locked', () => {
    expect(findWeaponType('laser')?.locked).toBe(true);
    expect(findWeaponType('missile')?.locked).toBe(true);
    expect(findWeaponType('blackhole')?.locked).toBe(true);
  });

  it('defines chute and asteroids categories', () => {
    const ids = CATEGORY_DEFS.map((c) => c.id);
    expect(ids).toEqual(['chute', 'asteroids']);
  });

  it('every weapon type starts with count 1', () => {
    for (const w of WEAPON_TYPES) {
      expect(w.startCount).toBe(1);
    }
  });

  it('each weapon type has at least one upgrade', () => {
    for (const w of WEAPON_TYPES.filter((w) => !w.locked)) {
      expect(w.upgrades.length).toBeGreaterThan(0);
    }
  });

  it('each category has at least one upgrade', () => {
    for (const c of CATEGORY_DEFS) {
      expect(c.upgrades.length).toBeGreaterThan(0);
    }
  });

  it('upgrade IDs use dotted prefix matching their parent', () => {
    for (const w of WEAPON_TYPES) {
      for (const u of w.upgrades) {
        expect(u.id).toMatch(new RegExp(`^${w.id}\\.`));
      }
    }
    for (const c of CATEGORY_DEFS) {
      for (const u of c.upgrades) {
        expect(u.id).toMatch(new RegExp(`^${c.id}\\.`));
      }
    }
  });

  it('allUpgradeDefs returns every upgrade across weapons and categories', () => {
    const all = allUpgradeDefs();
    const totalExpected =
      WEAPON_TYPES.reduce((n, w) => n + w.upgrades.length, 0) +
      CATEGORY_DEFS.reduce((n, c) => n + c.upgrades.length, 0);
    expect(all.length).toBe(totalExpected);
  });

  it('findUpgrade resolves dotted IDs', () => {
    expect(findUpgrade('saw.damage')).toBeDefined();
    expect(findUpgrade('saw.damage')?.name).toBe('Saw Damage');
    expect(findUpgrade('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/weaponCatalog.test.ts`
Expected: FAIL — module `./weaponCatalog` not found

- [ ] **Step 3: Create the weapon catalog**

Create `src/game/weaponCatalog.ts`:

```typescript
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
    icon: 'stopper',
    locked: false,
    startCount: 1,
    upgrades: [
      {
        id: 'grinder.damage',
        name: 'Grinder Damage',
        description: '+1 damage on contact',
        category: 'grinder',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 20,
      },
    ],
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
```

- [ ] **Step 4: Update upgradeCatalog.ts**

Remove `UPGRADE_CATALOG`, `UpgradeCategory`, and `findUpgrade` from `src/game/upgradeCatalog.ts`. Keep `UpgradeDef` (but make `category` a plain `string`), `costAtLevel`, and `isMaxed` — these are still used everywhere.

Updated `src/game/upgradeCatalog.ts`:

```typescript
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
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: New weaponCatalog tests PASS. Old upgradeApplier tests FAIL (they import removed symbols). Old catalog tests FAIL.

- [ ] **Step 6: Update upgradeApplier tests for dotted keys**

In `src/game/upgradeApplier.test.ts`, update the `applyUpgrades` tests to use dotted-prefix keys and update catalog tests to use `weaponCatalog`:

Replace the `applyUpgrades` describe block tests to use dotted keys:
```typescript
import {
  allUpgradeDefs,
  findUpgrade,
  WEAPON_TYPES,
  CATEGORY_DEFS,
} from './weaponCatalog';
```

Update individual test keys:
- `{ sawDamage: 3 }` → `{ 'saw.damage': 3 }`
- `{ bladeCount: 4 }` → `{ 'saw.bladeCount': 4 }`
- `{ channelWidth: 5 }` → `{ 'chute.channelWidth': 5 }`
- `{ dropRate: 2 }` / `{ dropRate: 99 }` → `{ 'asteroids.dropRate': 2 }` / `{ 'asteroids.dropRate': 99 }`
- `{ chunkHp: 7 }` → `{ 'asteroids.chunkHp': 7 }`
- `{ asteroidSize: 3 }` → `{ 'asteroids.asteroidSize': 3 }`
- Combined test: `{ sawDamage: 2, bladeCount: 1, chunkHp: 1 }` → `{ 'saw.damage': 2, 'saw.bladeCount': 1, 'asteroids.chunkHp': 1 }`

Replace the `upgradeCatalog` describe block:
```typescript
describe('weaponCatalog', () => {
  it('defines all expected upgrades', () => {
    const ids = allUpgradeDefs().map((u) => u.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'saw.damage',
        'saw.bladeCount',
        'chute.channelWidth',
        'asteroids.dropRate',
        'asteroids.chunkHp',
        'asteroids.asteroidSize',
      ]),
    );
  });

  it('findUpgrade looks up by dotted id', () => {
    expect(findUpgrade('saw.damage')?.category).toBe('saw');
    expect(findUpgrade('nope')).toBeUndefined();
  });

  it('costAtLevel grows with growth rate', () => {
    const def = findUpgrade('saw.damage')!;
    expect(costAtLevel(def, 0)).toBe(def.baseCost);
  });

  it('isMaxed flips at the cap', () => {
    const def = findUpgrade('saw.bladeCount')!;
    expect(isMaxed(def, def.maxLevel - 1)).toBe(false);
    expect(isMaxed(def, def.maxLevel)).toBe(true);
  });
});
```

- [ ] **Step 7: Update upgradeApplier.ts for dotted keys**

In `src/game/upgradeApplier.ts`, change the `lv()` lookups to use dotted prefixes:

```typescript
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
```

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (weaponCatalog tests + updated upgradeApplier tests + gameplayState tests)

- [ ] **Step 9: Commit**

```bash
git add src/game/weaponCatalog.ts src/game/weaponCatalog.test.ts src/game/upgradeCatalog.ts src/game/upgradeApplier.ts src/game/upgradeApplier.test.ts
git commit -m "refactor: weapon catalog with dotted upgrade keys, replace flat UPGRADE_CATALOG"
```

---

### Task 2: Weapon Count Tracking in gameplayState

**Files:**
- Modify: `src/game/gameplayState.ts`
- Modify: `src/game/upgradeApplier.test.ts` (gameplayState describe block)

- [ ] **Step 1: Write tests for weapon count tracking**

Add to the `gameplayState` describe block in `src/game/upgradeApplier.test.ts`:

```typescript
it('tracks weapon counts with buy and sell', () => {
  gameplayState.reset();
  gameplayState.initWeaponCounts({ grinder: 1, saw: 1 });
  expect(gameplayState.weaponCount('grinder')).toBe(1);
  expect(gameplayState.weaponCount('saw')).toBe(1);
  expect(gameplayState.weaponCount('laser')).toBe(0);
});

it('buyWeapon increments count and emits weaponCountChanged', () => {
  gameplayState.reset();
  gameplayState.initWeaponCounts({ saw: 1 });
  const events: Array<[string, number]> = [];
  gameplayState.on('weaponCountChanged', (id, count) => events.push([id, count]));
  gameplayState.buyWeapon('saw');
  expect(gameplayState.weaponCount('saw')).toBe(2);
  expect(events).toEqual([['saw', 2]]);
});

it('sellWeapon decrements count but not below 1', () => {
  gameplayState.reset();
  gameplayState.initWeaponCounts({ saw: 2 });
  const events: Array<[string, number]> = [];
  gameplayState.on('weaponCountChanged', (id, count) => events.push([id, count]));
  expect(gameplayState.sellWeapon('saw')).toBe(true);
  expect(gameplayState.weaponCount('saw')).toBe(1);
  expect(gameplayState.sellWeapon('saw')).toBe(false);
  expect(gameplayState.weaponCount('saw')).toBe(1);
  expect(events).toEqual([['saw', 1]]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/upgradeApplier.test.ts`
Expected: FAIL — `initWeaponCounts`, `weaponCount`, `buyWeapon`, `sellWeapon` not found

- [ ] **Step 3: Implement weapon count tracking**

In `src/game/gameplayState.ts`, add:

1. New event type in `Events` interface:
```typescript
weaponCountChanged: [id: string, count: number];
```

2. New private field:
```typescript
private readonly _weaponCounts = new Map<string, number>();
```

3. Add `weaponCountChanged: new Set()` to the `listeners` object.

4. New methods:
```typescript
initWeaponCounts(counts: Record<string, number>): void {
  this._weaponCounts.clear();
  for (const [id, count] of Object.entries(counts)) {
    this._weaponCounts.set(id, count);
  }
}

weaponCount(id: string): number {
  return this._weaponCounts.get(id) ?? 0;
}

buyWeapon(id: string): void {
  const current = this.weaponCount(id);
  this._weaponCounts.set(id, current + 1);
  this.emit('weaponCountChanged', id, current + 1);
}

sellWeapon(id: string): boolean {
  const current = this.weaponCount(id);
  if (current <= 1) return false;
  this._weaponCounts.set(id, current - 1);
  this.emit('weaponCountChanged', id, current - 1);
  return true;
}
```

5. Update `resetData()` to also clear `_weaponCounts`.
6. Update `reset()` to also clear `listeners.weaponCountChanged`.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/gameplayState.ts src/game/upgradeApplier.test.ts
git commit -m "feat: weapon count tracking in gameplayState (buy/sell/init)"
```

---

### Task 3: GameScene Multi-Instance Refactor

**Files:**
- Modify: `src/scenes/GameScene.ts`

This is the largest task. It replaces the single stopper + single blade fleet with a `WeaponInstance[]` array.

- [ ] **Step 1: Define WeaponInstance interface and replace properties**

At the top of `GameScene.ts`, add the interface and update imports:

```typescript
import { WEAPON_TYPES, findWeaponType } from '../game/weaponCatalog';

interface WeaponInstance {
  id: string;
  type: string;
  sprite: Phaser.Physics.Matter.Image;
  orbitAngle: number;
  blades: Phaser.Physics.Matter.Image[];
}
```

Replace in the class:
- `private stopper!: Phaser.Physics.Matter.Image;` → remove
- `private sawBlades: Phaser.Physics.Matter.Image[] = [];` → remove
- `private sawAngle = 0;` → remove
- Add: `private weaponInstances: WeaponInstance[] = [];`
- Add: `private nextInstanceId = 0;`

- [ ] **Step 2: Replace buildStopper with spawnWeaponInstance**

Remove `buildStopper()`. Add a general `spawnWeaponInstance(type, x, y)` method:

```typescript
private spawnWeaponInstance(typeId: string, x: number, y: number): WeaponInstance {
  const id = `${typeId}-${this.nextInstanceId++}`;
  const texKey = typeId === 'grinder' ? 'stopper' : typeId;
  const radius = typeId === 'grinder' ? STOPPER_RADIUS : STOPPER_RADIUS;

  const sprite = this.matter.add.image(x, y, texKey);
  sprite.setCircle(radius);
  sprite.setStatic(true);
  sprite.setFriction(0.2);
  sprite.setInteractive({ draggable: true });
  this.input.setDraggable(sprite);
  sprite.setData('kind', typeId);
  sprite.setData('instanceId', id);

  const instance: WeaponInstance = {
    id,
    type: typeId,
    sprite,
    orbitAngle: 0,
    blades: [],
  };

  this.weaponInstances.push(instance);

  if (typeId === 'saw') {
    this.rebuildBladesForInstance(instance, this.effectiveParams.bladeCount);
  }

  return instance;
}
```

- [ ] **Step 3: Update create() to spawn initial weapon instances**

Replace `this.buildStopper(width)` and `this.rebuildBlades(...)` in `create()` with:

```typescript
// Spawn initial weapon instances (one per unlocked type).
for (const wt of WEAPON_TYPES) {
  if (wt.locked) continue;
  for (let i = 0; i < wt.startCount; i++) {
    const jitter = (Math.random() - 0.5) * 40;
    this.spawnWeaponInstance(wt.id, width / 2 + jitter, 500);
  }
}
gameplayState.initWeaponCounts(
  Object.fromEntries(WEAPON_TYPES.filter((w) => !w.locked).map((w) => [w.id, w.startCount])),
);
```

Also subscribe to `weaponCountChanged`:
```typescript
this.unsubs.push(
  gameplayState.on('weaponCountChanged', (typeId, count) => {
    this.onWeaponCountChanged(typeId, count);
  }),
);
```

(Rename `unsubscribeUpgrade` to `unsubs: Array<() => void> = []` to match UIScene pattern, and push both upgrade and count listeners into it.)

- [ ] **Step 4: Replace rebuildBlades with per-instance version**

Remove `rebuildBlades(count)`. Add:

```typescript
private rebuildBladesForInstance(instance: WeaponInstance, count: number): void {
  for (const blade of instance.blades) blade.destroy();
  instance.blades = [];
  for (let i = 0; i < count; i++) {
    const blade = this.matter.add.image(0, 0, 'saw');
    blade.setCircle(SAW_RADIUS);
    blade.setSensor(true);
    blade.setIgnoreGravity(true);
    blade.setFrictionAir(0);
    blade.setMass(0.001);
    blade.setData('kind', 'saw');
    instance.blades.push(blade);
  }
}
```

- [ ] **Step 5: Update the update() loop**

Replace the saw orbit block (lines 98-109) with iteration over all instances:

```typescript
for (const inst of this.weaponInstances) {
  if (inst.type === 'saw' && inst.blades.length > 0) {
    inst.orbitAngle += (SAW_ORBIT_RAD_PER_SEC * delta) / 1000;
    const bladeCount = inst.blades.length;
    for (let i = 0; i < bladeCount; i++) {
      const phase = inst.orbitAngle + (i * Math.PI * 2) / bladeCount;
      const sx = inst.sprite.x + Math.cos(phase) * SAW_ORBIT_RADIUS;
      const sy = inst.sprite.y + Math.sin(phase) * SAW_ORBIT_RADIUS;
      const blade = inst.blades[i];
      blade.setPosition(sx, sy);
      blade.setVelocity(0, 0);
      blade.setRotation(blade.rotation + delta * 0.02);
    }
  }
}
```

- [ ] **Step 6: Update drag handler**

Replace the drag handler to work with any weapon instance:

```typescript
this.input.on(
  Phaser.Input.Events.DRAG,
  (_pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
    const inst = this.weaponInstances.find((w) => w.sprite === obj);
    if (!inst) return;
    const halfW = this.scale.width / 2;
    const halfChannel = this.effectiveParams.channelHalfWidth;
    const radius = STOPPER_RADIUS;
    const minX = halfW - halfChannel + radius + 4;
    const maxX = halfW + halfChannel - radius - 4;
    const cx = Phaser.Math.Clamp(dragX, minX, maxX);
    const cy = Phaser.Math.Clamp(dragY, CHANNEL_TOP_Y + radius + 4, DEATH_LINE_Y - radius - 4);
    inst.sprite.setPosition(cx, cy);
  },
);
```

Move this handler into `create()` (not inside a per-instance method), since it handles all draggable sprites globally.

- [ ] **Step 7: Add buy/sell handlers**

```typescript
private onWeaponCountChanged(typeId: string, newCount: number): void {
  const currentInstances = this.weaponInstances.filter((i) => i.type === typeId);
  if (newCount > currentInstances.length) {
    // Buy — spawn at random position in channel.
    const halfW = this.scale.width / 2;
    const halfChannel = this.effectiveParams.channelHalfWidth;
    const rx = halfW + (Math.random() - 0.5) * halfChannel;
    const ry = CHANNEL_TOP_Y + 100 + Math.random() * (DEATH_LINE_Y - CHANNEL_TOP_Y - 200);
    this.spawnWeaponInstance(typeId, rx, ry);
  } else if (newCount < currentInstances.length) {
    // Sell — remove a random instance of this type.
    const idx = Math.floor(Math.random() * currentInstances.length);
    const victim = currentInstances[idx];
    for (const blade of victim.blades) blade.destroy();
    victim.sprite.destroy();
    this.weaponInstances = this.weaponInstances.filter((i) => i !== victim);
  }
}
```

- [ ] **Step 8: Update recomputeEffectiveParams for multi-instance blade rebuild**

In `recomputeEffectiveParams()`, the blade count change now rebuilds all saw instances:

```typescript
if (this.effectiveParams.bladeCount !== prev.bladeCount) {
  for (const inst of this.weaponInstances) {
    if (inst.type === 'saw') {
      this.rebuildBladesForInstance(inst, this.effectiveParams.bladeCount);
    }
  }
}
```

- [ ] **Step 9: Update rebuildChannelWalls to clamp all weapons**

Replace the single `this.stopper?.setPosition(...)` at the end of `rebuildChannelWalls()` with:

```typescript
for (const inst of this.weaponInstances) {
  inst.sprite.setPosition(
    Phaser.Math.Clamp(inst.sprite.x, minX, maxX),
    inst.sprite.y,
  );
}
```

- [ ] **Step 10: Update collision handler for grinder damage**

In `handleContact()`, add grinder collision handling alongside the existing saw handling:

```typescript
let chunk: Phaser.Physics.Matter.Image | null = null;
let damageSource: string | null = null;

if (goA.getData('kind') === 'saw' && goB.getData('kind') === 'chunk') {
  chunk = goB as Phaser.Physics.Matter.Image;
  damageSource = 'saw';
} else if (goB.getData('kind') === 'saw' && goA.getData('kind') === 'chunk') {
  chunk = goA as Phaser.Physics.Matter.Image;
  damageSource = 'saw';
} else if (goA.getData('kind') === 'grinder' && goB.getData('kind') === 'chunk') {
  chunk = goB as Phaser.Physics.Matter.Image;
  damageSource = 'grinder';
} else if (goB.getData('kind') === 'grinder' && goA.getData('kind') === 'chunk') {
  chunk = goA as Phaser.Physics.Matter.Image;
  damageSource = 'grinder';
}

if (!chunk || !damageSource) return;
```

Then use `damageSource` to pick the right damage value:
```typescript
const damage = damageSource === 'saw'
  ? this.effectiveParams.sawDamage
  : (1 + gameplayState.levelOf('grinder.damage'));
```

- [ ] **Step 11: Update shutdown cleanup**

Replace the shutdown handler to clean up all instances:

```typescript
this.events.once('shutdown', () => {
  for (const u of this.unsubs) u();
  this.unsubs = [];
  if (this.collisionHandler) {
    this.matter.world.off('collisionstart', this.collisionHandler);
    this.matter.world.off('collisionactive', this.collisionHandler);
    this.collisionHandler = null;
  }
  for (const inst of this.weaponInstances) {
    for (const blade of inst.blades) blade.destroy();
    inst.sprite.destroy();
  }
  this.weaponInstances = [];
});
```

- [ ] **Step 12: Update debug HUD text**

Replace `blades ${this.sawBlades.length}` with:
```typescript
`weapons ${this.weaponInstances.length}  ·  dmg ${this.effectiveParams.sawDamage}  ·  spawn ${this.effectiveParams.spawnIntervalMs}ms`
```

- [ ] **Step 13: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with no errors

- [ ] **Step 14: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "refactor: multi-instance weapons replace single stopper in GameScene"
```

---

### Task 4: UIScene Weapon Bar & Sub-Panel

**Files:**
- Modify: `src/scenes/UIScene.ts`

This replaces the flat upgrade panel with the weapon bar + sub-panel layout.

- [ ] **Step 1: Replace imports and constants**

Replace the `upgradeCatalog` imports with:

```typescript
import {
  WEAPON_TYPES,
  CATEGORY_DEFS,
  type WeaponTypeDef,
  type CategoryDef,
} from '../game/weaponCatalog';
import { costAtLevel, isMaxed, type UpgradeDef } from '../game/upgradeCatalog';
```

Replace layout constants:
```typescript
const BAR_X = 8;
const BAR_Y = 44;
const BAR_BUTTON_SIZE = 52;
const BAR_GAP = 6;
const SUBPANEL_X = BAR_X + BAR_BUTTON_SIZE + 6;
const SUBPANEL_W = 170;
const SUBPANEL_Y = BAR_Y;
```

- [ ] **Step 2: Implement the WeaponBarButton class**

Each button in the weapon bar. Handles: icon, name, count badge, selected state, locked state.

```typescript
class WeaponBarButton {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly countText: Phaser.GameObjects.Text | null;
  private selected = false;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly def: WeaponTypeDef | CategoryDef,
    private readonly isWeapon: boolean,
    private readonly onClick: () => void,
  ) {
    const locked = isWeapon && (def as WeaponTypeDef).locked;
    this.bg = scene.add
      .rectangle(x, y, BAR_BUTTON_SIZE, BAR_BUTTON_SIZE, locked ? 0x141420 : 0x202030)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a4a5c);

    if (!locked) {
      this.bg.setInteractive({ useHandCursor: true });
      this.bg.on('pointerdown', () => this.onClick());
    }

    this.nameText = scene.add
      .text(x + BAR_BUTTON_SIZE / 2, y + BAR_BUTTON_SIZE - 8, def.name, {
        font: '8px ui-monospace',
        color: locked ? '#404050' : '#a0a0b8',
      })
      .setOrigin(0.5);

    if (isWeapon && !locked) {
      this.countText = scene.add
        .text(x + BAR_BUTTON_SIZE - 6, y + 4, '×1', {
          font: 'bold 9px ui-monospace',
          color: '#b0ffa8',
        })
        .setOrigin(1, 0);
    } else {
      this.countText = null;
    }
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    const locked = this.isWeapon && (this.def as WeaponTypeDef).locked;
    if (locked) return;
    this.bg.setStrokeStyle(selected ? 2 : 1, selected ? 0xff6666 : 0x4a4a5c);
    this.bg.setFillStyle(selected ? 0x2a1a1a : 0x202030);
  }

  updateCount(count: number): void {
    this.countText?.setText(`×${count}`);
  }
}
```

- [ ] **Step 3: Implement the SubPanel class**

Handles: header, buy/sell buttons (for weapons), upgrade rows.

```typescript
class SubPanel {
  private container: Phaser.GameObjects.Container;
  private upgradeButtons: UpgradeButton[] = [];
  private buyButton: Phaser.GameObjects.Rectangle | null = null;
  private sellButton: Phaser.GameObjects.Rectangle | null = null;
  private buyText: Phaser.GameObjects.Text | null = null;
  private sellText: Phaser.GameObjects.Text | null = null;
  private headerText: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly def: WeaponTypeDef | CategoryDef,
    private readonly isWeapon: boolean,
  ) {
    this.container = scene.add.container(SUBPANEL_X, SUBPANEL_Y);
    let yOff = 0;

    // Header
    this.headerText = scene.add.text(0, yOff, def.name, {
      font: 'bold 12px ui-monospace',
      color: '#e8e8f0',
    });
    this.container.add(this.headerText);
    yOff += 20;

    // Buy/Sell for weapons
    if (isWeapon) {
      const btnW = (SUBPANEL_W - 6) / 2;
      const btnH = 32;

      this.buyButton = scene.add
        .rectangle(0, yOff, btnW, btnH, 0x233024)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x4a5c4a)
        .setInteractive({ useHandCursor: true });
      this.buyText = scene.add.text(btnW / 2, yOff + btnH / 2, 'Buy $1', {
        font: 'bold 10px ui-monospace',
        color: '#b0ffa8',
      }).setOrigin(0.5);
      this.buyButton.on('pointerdown', () => this.onBuy());
      this.container.add([this.buyButton, this.buyText]);

      this.sellButton = scene.add
        .rectangle(btnW + 6, yOff, btnW, btnH, 0x302323)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x5c4a4a)
        .setInteractive({ useHandCursor: true });
      this.sellText = scene.add.text(btnW + 6 + btnW / 2, yOff + btnH / 2, 'Sell $1', {
        font: 'bold 10px ui-monospace',
        color: '#ffa0a0',
      }).setOrigin(0.5);
      this.sellButton.on('pointerdown', () => this.onSell());
      this.container.add([this.sellButton, this.sellText]);

      yOff += btnH + 8;
    }

    // Upgrades header
    if (def.upgrades.length > 0) {
      const upgLabel = scene.add.text(0, yOff, 'UPGRADES', {
        font: 'bold 9px ui-monospace',
        color: '#a0a0b8',
      });
      this.container.add(upgLabel);
      yOff += 16;

      for (const upgDef of def.upgrades) {
        const btn = new UpgradeButton(scene, 0, yOff, SUBPANEL_W, 40, upgDef, this.container);
        this.upgradeButtons.push(btn);
        yOff += 44;
      }
    }
  }

  refresh(): void {
    if (this.isWeapon) {
      const wDef = this.def as WeaponTypeDef;
      const count = gameplayState.weaponCount(wDef.id);
      this.headerText.setText(`${wDef.name} ×${count}`);
      const buyCost = count + 1;
      this.buyText?.setText(`Buy $${buyCost}`);
      const canBuy = gameplayState.cash >= buyCost;
      this.buyButton?.setFillStyle(canBuy ? 0x233024 : 0x1a1a20);
      this.buyText?.setColor(canBuy ? '#b0ffa8' : '#606068');

      const canSell = count > 1;
      this.sellButton?.setFillStyle(canSell ? 0x302323 : 0x1a1a20);
      this.sellText?.setColor(canSell ? '#ffa0a0' : '#606068');
      if (canSell) {
        this.sellButton?.setInteractive({ useHandCursor: true });
      } else {
        this.sellButton?.disableInteractive();
      }
    }
    for (const btn of this.upgradeButtons) btn.refresh();
  }

  destroy(): void {
    this.container.destroy();
  }

  private onBuy(): void {
    const wDef = this.def as WeaponTypeDef;
    const count = gameplayState.weaponCount(wDef.id);
    const cost = count + 1;
    if (gameplayState.trySpend(cost)) {
      gameplayState.buyWeapon(wDef.id);
    }
  }

  private onSell(): void {
    const wDef = this.def as WeaponTypeDef;
    if (gameplayState.sellWeapon(wDef.id)) {
      gameplayState.addCash(1);
    }
  }
}
```

- [ ] **Step 4: Rework UpgradeButton to accept a container parent**

Update the `UpgradeButton` constructor to add its game objects to a container instead of directly to the scene root. The class stays mostly the same — adjust the constructor signature:

```typescript
class UpgradeButton {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly descText: Phaser.GameObjects.Text;
  private hovered = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    private readonly def: UpgradeDef,
    container: Phaser.GameObjects.Container,
  ) {
    this.bg = scene.add
      .rectangle(x, y, w, h, 0x202030)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4a4a5c);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerdown', () => this.tryBuy());
    this.bg.on('pointerover', () => { this.hovered = true; this.applyFill(); });
    this.bg.on('pointerout', () => { this.hovered = false; this.applyFill(); });

    this.nameText = scene.add.text(x + 8, y + 4, def.name, {
      font: 'bold 11px ui-monospace',
      color: '#e8e8f0',
    });
    this.statsText = scene.add.text(x + 8, y + 18, '', {
      font: '9px ui-monospace',
      color: '#a0a0b8',
    });
    this.descText = scene.add.text(x + 8, y + 28, def.description, {
      font: '9px ui-monospace',
      color: '#707088',
    });

    container.add([this.bg, this.nameText, this.statsText, this.descText]);
  }

  // refresh(), applyFill(), tryBuy() stay the same as Phase 3
  // (just uses the def's dotted id for gameplayState.levelOf)
}
```

- [ ] **Step 5: Rewrite UIScene.create() with the new layout**

Replace `buildUpgradePanel()` and its call with the weapon bar + sub-panel system:

```typescript
export class UIScene extends Phaser.Scene {
  private cashText!: Phaser.GameObjects.Text;
  private barButtons: WeaponBarButton[] = [];
  private activePanel: SubPanel | null = null;
  private selectedId: string | null = null;
  private unsubs: Array<() => void> = [];

  create(): void {
    this.cashText = this.add.text(BAR_X, 10, '$0', {
      font: 'bold 26px ui-monospace',
      color: '#ffd166',
    });

    this.buildWeaponBar();

    this.unsubs.push(
      gameplayState.on('cashChanged', (cash) => {
        this.cashText.setText(`$${cash}`);
        this.tweens.add({
          targets: this.cashText,
          scale: { from: 1.15, to: 1 },
          duration: 160,
          ease: 'Quad.out',
        });
        this.activePanel?.refresh();
      }),
    );
    this.unsubs.push(
      gameplayState.on('upgradeLevelChanged', () => {
        this.activePanel?.refresh();
      }),
    );
    this.unsubs.push(
      gameplayState.on('weaponCountChanged', (id) => {
        for (const btn of this.barButtons) btn.updateCount(gameplayState.weaponCount(id));
        this.activePanel?.refresh();
      }),
    );

    this.events.once('shutdown', () => {
      for (const u of this.unsubs) u();
      this.unsubs = [];
    });
  }
}
```

- [ ] **Step 6: Build the weapon bar**

```typescript
private buildWeaponBar(): void {
  let y = BAR_Y;

  // Categories first (Chute, Asteroids)
  for (const cat of CATEGORY_DEFS) {
    const btn = new WeaponBarButton(this, BAR_X, y, cat, false, () => this.togglePanel(cat.id, cat, false));
    this.barButtons.push(btn);
    y += BAR_BUTTON_SIZE + BAR_GAP;
  }

  // Divider
  const dividerY = y + 2;
  this.add.text(BAR_X, dividerY, '─ WEAPONS ─', {
    font: 'bold 8px ui-monospace',
    color: '#606078',
  });
  y += 18;

  // Weapons
  for (const wt of WEAPON_TYPES) {
    const btn = new WeaponBarButton(this, BAR_X, y, wt, true, () => this.togglePanel(wt.id, wt, true));
    this.barButtons.push(btn);
    y += BAR_BUTTON_SIZE + BAR_GAP;
  }
}
```

- [ ] **Step 7: Implement togglePanel**

```typescript
private togglePanel(id: string, def: WeaponTypeDef | CategoryDef, isWeapon: boolean): void {
  if (this.selectedId === id) {
    // Close current panel
    this.activePanel?.destroy();
    this.activePanel = null;
    this.selectedId = null;
    for (const btn of this.barButtons) btn.setSelected(false);
    return;
  }

  // Close old, open new
  this.activePanel?.destroy();
  this.selectedId = id;
  for (const btn of this.barButtons) btn.setSelected(false);
  const idx = this.barButtons.findIndex((_, i) => {
    const allDefs = [...CATEGORY_DEFS, ...WEAPON_TYPES];
    return allDefs[i]?.id === id;
  });
  if (idx >= 0) this.barButtons[idx].setSelected(true);

  this.activePanel = new SubPanel(this, def, isWeapon);
  this.activePanel.refresh();
}
```

- [ ] **Step 8: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with no errors

- [ ] **Step 9: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: weapon bar + sub-panel UI replaces flat upgrade panel"
```

---

### Task 5: Integration Verification

**Files:** None — verification only.

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Start dev server and verify in Chrome**

Run: `npm run dev`

Open http://127.0.0.1:5173 in Chrome. Verify:

1. Weapon bar visible on left (Chute, Asteroids, divider, Grinder, Saw, 3 locked)
2. Click Saw → sub-panel opens with Buy/Sell and upgrades
3. Click Buy → new saw appears in arena at random position
4. New saw orbits its own blade fleet independently
5. Drag any weapon to reposition
6. Click Sell → a random saw disappears (disabled when only 1 left)
7. Buy an upgrade → all instances of that weapon type update
8. Grinder: click Buy → new grinder appears, damages chunks on contact
9. Chute: click → sub-panel shows Channel Width upgrade only
10. Asteroids: click → sub-panel shows Drop Rate, Chunk HP, Asteroid Size
11. Locked weapons (Laser, Missile, B. Hole) are grayed out, not clickable
12. Cash updates correctly on buy/sell/upgrade

- [ ] **Step 4: Commit any fixes from verification**

If any issues found, fix and commit individually.

---

### Task 6: Update ROADMAP.md and Docs

**Files:**
- Modify: `ROADMAP.md`
- Modify: `CLAUDE.md` (update layout section if needed)

- [ ] **Step 1: Update ROADMAP.md**

Mark Phase 4 as done with date. Update the phase description to reflect what actually shipped (weapon-centric shop, not stopper-based). Clear Phase 4 todos. Add economy rebalance to backlog (after weapons + all money-touching features). Update Phase 5 description to note that the weapon bar UI is already in place.

- [ ] **Step 2: Update CLAUDE.md layout section**

Update the Layout section to reflect new files (`weaponCatalog.ts`, updated `UIScene.ts` structure).

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md CLAUDE.md
git commit -m "docs: mark phase 4 done, update roadmap and project conventions"
```

---

### Task 7: Code Review

**Files:** All changed files from Tasks 1-6.

- [ ] **Step 1: Dispatch a fresh code reviewer agent**

The reviewer should check all changes on `feature/phase-4-stoppers-shop` since the branch diverged from `main`. Focus on:
- Type safety (no `any` leaks, correct generics)
- Event listener cleanup (no leaks on scene shutdown)
- Physics body cleanup (all sprites/blades destroyed on sell and shutdown)
- Data consistency (weapon counts in gameplayState match actual instances in GameScene)
- UI state consistency (sub-panel refreshes on all relevant events)

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Commit fixes**

```bash
git commit -m "phase 4 review fixes: [description of fixes]"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck + build**

Run: `npm run build`
Expected: PASS (tsc --noEmit + vite build)

- [ ] **Step 3: Verify in Chrome one final time**

Start dev server, open Chrome, run through the full flow: buy weapons, sell weapons, upgrade, verify arena behavior, check debug mode (`?debug=1`).

- [ ] **Step 4: Push branch**

```bash
git push origin feature/phase-4-stoppers-shop
```
