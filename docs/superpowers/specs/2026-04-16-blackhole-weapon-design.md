# Black Hole Weapon — Design Spec

Gravity vortex that pulls live chunks inward for core damage and repels dead chunks outward.

## Visual — MVP

Dark purple circle at the weapon's position. Faint semi-transparent range indicator circle. No particles, no swirl — art pass later.

## Physics

- **Body:** static circle, same size as other turrets (TURRET_RADIUS = 10). Blocks all chunks physically. Draggable.
- **Gravity field:** per-frame force application to chunks in range. No physics body for the field itself.
- **Live chunks:** pulled toward center with inverse-distance force (`pullForce / distance`).
- **Dead chunks:** pushed away from center with same force magnitude (`pullForce / distance`), reversed direction.

## Behavior

Each frame:
1. Scan all chunks within `pullRange`
2. Sort by distance, take the closest `maxTargets` bodies (deduplicate by parent rigid body — welded chunks share a body)
3. For each selected body:
   - If alive: apply force toward vortex center
   - If dead: apply force away from vortex center
4. Any alive chunk within `coreRadius` takes continuous DPS damage

Note: deduplication by parent body isn't straightforward in our architecture since chunks don't share rigid bodies after fracture. For MVP, just apply forces to individual chunk images and cap by `maxTargets` count.

## Upgrade Definitions

| Upgrade | ID | Base | Per Level | Max Lv | At Max | Effect |
|---|---|---|---|---|---|---|
| Pull Range | `blackhole.pullRange` | 60 px | +8 | 20 | 220 px | Gravity field radius |
| Pull Force | `blackhole.pullForce` | 0.0003 | +0.00015 | 20 | 0.0033 | Inverse-distance force (attracts live, repels dead) |
| Core Size | `blackhole.coreSize` | 15 px | +3 | 20 | 75 px | Inner damage zone radius |
| Core Damage | `blackhole.coreDamage` | 1 DPS | +0.5 | 20 | 11 DPS | Continuous DPS to chunks in core |
| Max Targets | `blackhole.maxTargets` | 3 | +1 | 10 | 13 | Max chunks affected per frame |

Note: Pull force values are in Matter.js `applyForce` units (very small). Tuned for chunks with mass 0.25.

All costs placeholder $1 flat.

## Files to Create/Modify

- **Create: `src/game/blackhole.ts`** — BlackHole class: per-frame gravity + core damage logic
- **Modify: `src/game/weaponCatalog.ts`** — unlock blackhole, add 5 upgrade defs
- **Modify: `src/game/upgradeApplier.ts`** — add blackhole params to EffectiveGameplayParams
- **Modify: `src/scenes/GameScene.ts`** — blackhole texture, range visual, spawn/destroy, update loop (gravity + core damage)
- **Modify: `src/game/upgradeApplier.test.ts`** — test coverage for blackhole params

## Out of Scope

- Swirl particles (art pass)
- Accretion disk visual (art pass)
- Sound effects
