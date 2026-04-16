# Phase 4 — Weapon Shop & Multi-Instance Weapons

## Summary

Replace the single-stopper model with a weapon-centric shop. Each weapon type (Grinder, Saw, and future types) is a top-level menu entry. Players can buy multiple instances of any weapon, drag them into position in the arena, and upgrade each weapon type globally. The stopper concept is absorbed into the Grinder weapon type.

## UI Layout

### Weapon bar

Vertical column of square buttons, top-left of the screen, below the cash display. Order:

```
[Chute]       ← upgrades only (Channel Width, future wall upgrades)
[Asteroids]   ← upgrades only (Drop Rate, Chunk HP, Asteroid Size)
─── WEAPONS ───
[Grinder]     ← buy/sell/upgrades
[Saw]         ← buy/sell/upgrades
[Laser]       ← locked (visual only, Phase 5)
[Missile]     ← locked (visual only, Phase 5)
[B. Hole]     ← locked (visual only, Phase 5)
```

Each button shows:
- Icon representing the weapon/category (procedural texture or placeholder)
- Name (small text)
- Instance count for weapons (×1, ×2, etc.) — omitted for Chute/Asteroids

Locked weapons are grayed out and non-interactive.

### Sub-panel

Opens to the right of the weapon bar when a button is clicked. Clicking the same button again closes it. Clicking a different button switches to that sub-panel.

**For weapons (Grinder, Saw):**
- Header: weapon name + count
- [Buy] and [Sell] buttons side by side
  - Buy: spawns a new instance at a random valid position in the channel
  - Sell: removes a random instance of that type; disabled when count is 1 (can never sell the last one)
- UPGRADES section: one row per upgrade definition for that weapon type

**For Chute and Asteroids:**
- Header: category name
- No Buy/Sell row
- UPGRADES section only

Upgrade rows match the existing Phase 3 visual style: category stripe, name, level/maxLevel, cost. Green tint when affordable, dimmed when maxed.

## Data Model

### WeaponType registry

Static data per weapon type, replacing the flat `UPGRADE_CATALOG`:

```typescript
interface WeaponTypeDef {
  id: string              // 'grinder' | 'saw' | 'laser' | 'missile' | 'blackhole'
  name: string            // display name
  icon: string            // texture key
  upgrades: UpgradeDef[]  // per-type upgrade definitions
  startCount: number      // how many the player starts with (1 for all in Phase 4)
  locked: boolean         // true for Laser/Missile/BlackHole in Phase 4
}
```

Non-weapon categories (Chute, Asteroids) use a similar shape but without buy/sell/count semantics:

```typescript
interface CategoryDef {
  id: string              // 'chute' | 'asteroids'
  name: string
  icon: string
  upgrades: UpgradeDef[]
}
```

### WeaponInstance

Runtime object per placed weapon in the arena:

```typescript
interface WeaponInstance {
  id: string                              // unique, e.g. "saw-0", "saw-1"
  type: string                            // weapon type id
  sprite: Phaser.Physics.Matter.Image     // draggable body
  orbitAngle: number                      // per-instance orbit state (saw uses, grinder ignores)
  blades: Phaser.Physics.Matter.Image[]   // per-instance blade fleet (saw only)
}
```

### State in gameplayState

- Upgrade levels: stored in existing `_levels` Map, keyed with dotted prefix: `'saw.damage'`, `'saw.bladeCount'`, `'chute.channelWidth'`, `'asteroids.dropRate'`, etc.
- Instance counts: new `Map<string, number>` tracking how many of each weapon type the player owns. Initialized from `startCount`.
- New event: `'weaponCountChanged'` emitted on buy/sell, consumed by both GameScene and UIScene.

## GameScene Changes

### Instance management

- `this.stopper` + `this.sawBlades` + `this.sawAngle` replaced by `this.weaponInstances: WeaponInstance[]`
- `update()` iterates all instances:
  - Saw instances: advance `orbitAngle`, reposition `blades` around `sprite`
  - Grinder instances: no per-frame work (static body, damage via collision)
- `rebuildBlades()` becomes `rebuildBladesForInstance(instance)`, called when `saw.bladeCount` upgrade changes (rebuilds all saw instances' blade fleets)

### Spawning (buy)

Create sprite at random (x, y) within channel bounds, set up physics (static, interactive, draggable), add to `weaponInstances`. For saw: also build initial blade fleet.

### Selling

Pick a random instance of the given type (excluding the original starter if it's the last one — though since count is checked at ×1, any instance is fine to remove). Destroy sprite + blades, remove from `weaponInstances`.

### Drag

Works as today. The drag handler already receives the dragged object — clamp any weapon sprite to channel bounds. No change to the clamping logic, just applied to all weapon sprites instead of a single stopper.

### Collision

Existing collision handler checks `body.gameObject?.getData('kind')`. Grinder instances use `kind: 'grinder'` with damage-on-contact. Saw blades keep `kind: 'saw'`. Damage routing unchanged.

## What Doesn't Change

- Channel walls, death line, asteroid spawner, asteroid/chunk damage and fracture logic
- `applyUpgrades()` pure function pattern (input: levels → output: effective params)
- Matter solver tuning (positionIterations=20, velocityIterations=14)

## Economy (Placeholder)

All costs use `baseCost: 1, growthRate: 1` (flat $1 increments). Buy cost = current count + 1. Sell refund = $1. Upgrade costs = $1 per level. Full economy rebalance is a separate future phase, explicitly deferred until after all weapons and money-touching systems are complete.

## Phase 4 Scope

### Ships

- Weapon bar UI (Chute, Asteroids, divider, Grinder, Saw, 3 locked placeholders)
- Sub-panel with Buy/Sell for weapons, upgrades for all categories
- Multiple weapon instances: buy, drag, sell
- Grinder as weapon type (circular static body, damage on collision)
- Saw as weapon type (orbiting blade fleet)
- Every weapon type starts at ×1
- Placeholder economy
- Existing vitest tests updated for new data model

### Deferred

- Laser, Missile, Black Hole weapon behaviors → Phase 5
- Grinder visual overhaul to spinning saws → backlog (after weapons)
- Economy rebalance → backlog (after weapons + all money-touching features)
- Per-instance weapon art/icons → art pass
- Save/load of weapon instance positions → Phase 7 (save & offline)
