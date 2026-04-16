# Weapon Abstraction Refactor — Design Spec

Extract weapon-specific logic from GameScene into per-weapon-type classes behind a common `WeaponBehavior` interface. GameScene becomes weapon-agnostic — adding a new weapon means creating one file and registering it.

## Interface

```typescript
// src/game/weaponBehavior.ts

interface WeaponBehavior {
  readonly textureKey: string;
  readonly bodyRadius: number;
  readonly blocksChunks: boolean;  // used by barrier enforcement

  /** Generate procedural textures. Called once in preload(). */
  createTextures(scene: Phaser.Scene): void;

  /** Set up weapon-specific state + visuals after sprite is created. */
  init(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void;

  /** Per-frame update: targeting, damage, visuals. */
  update(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    delta: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: EffectiveGameplayParams,
  ): void;

  /** React to upgrade level changes (e.g., rebuild saw blades). */
  onUpgrade(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Image,
    prev: EffectiveGameplayParams,
    next: EffectiveGameplayParams,
  ): void;

  /** Clean up weapon-specific visuals and state. */
  destroy(): void;
}
```

## WeaponInstance simplified

```typescript
interface WeaponInstance {
  id: string;
  type: string;
  sprite: Phaser.Physics.Matter.Image;
  behavior: WeaponBehavior;
}
```

No more optional fields. All weapon state lives inside the behavior.

## Implementations

- `src/game/weapons/sawBehavior.ts` — orbitAngle, blades array, tangential impulse, blade textures
- `src/game/weapons/laserBehavior.ts` — Laser instance, beam Graphics
- `src/game/weapons/missileBehavior.ts` — MissileLauncher, projectile array + Rectangle visuals
- `src/game/weapons/blackholeBehavior.ts` — BlackHole instance, range indicator Arc

## Registration

A `behaviorForType(typeId: string): WeaponBehavior` factory function (or map) in `src/game/weaponBehavior.ts` returns a fresh behavior instance per weapon type.

## GameScene changes

- `preload()`: iterate registered behaviors, call `createTextures()` once each
- `spawnWeaponInstance()`: look up behavior, use `behavior.textureKey` and `behavior.bodyRadius`, call `behavior.init()`
- `update()`: single loop — `inst.behavior.update(...)` for every instance
- `recomputeEffectiveParams()`: `inst.behavior.onUpgrade(...)`
- `onWeaponCountChanged` sell + `shutdown`: `inst.behavior.destroy()`
- Barrier enforcement: check `inst.behavior.blocksChunks`
- Collision handler: needs special handling since saw damage goes through `collisionactive`. The saw behavior will register its own collision needs.

## Collision handling

The saw is the only weapon that uses the Matter collision system. Options:
- **A)** Keep the collision handler in GameScene but have it delegate to the behavior via a method like `handleCollision(chunk)`. Only saw implements it; others are no-ops.
- **B)** Let the saw behavior register its own collision listener.

Going with **A** — simpler, avoids multiple collision listener registrations.

Add to the interface:
```typescript
handleCollision?(chunk: Phaser.Physics.Matter.Image, blade: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void;
```

GameScene collision handler checks if either body's `kind` matches a weapon, looks up the instance, and delegates.

## Files changed

- **Create: `src/game/weaponBehavior.ts`** — interface + factory
- **Create: `src/game/weapons/sawBehavior.ts`**
- **Create: `src/game/weapons/laserBehavior.ts`**
- **Create: `src/game/weapons/missileBehavior.ts`**
- **Create: `src/game/weapons/blackholeBehavior.ts`**
- **Modify: `src/scenes/GameScene.ts`** — replace all weapon branches with generic behavior calls
- **Keep: `src/game/laser.ts`, `src/game/missile.ts`, `src/game/blackhole.ts`** — pure logic classes, unchanged. Behaviors compose them.

## Out of scope

- Moving the Grinder to a WeaponBehavior (it's the death line, not a placed weapon)
- Changing the upgrade system
- Changing weaponCatalog.ts
