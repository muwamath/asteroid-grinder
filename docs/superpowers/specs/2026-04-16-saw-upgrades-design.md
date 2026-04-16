# Saw Upgrade Tree Expansion — Design Spec

Three new upgrades for the Saw weapon: Spin Speed, Orbit Speed, and Blade Size. Brings the total saw upgrades from 2 to 5, matching the Unity prototype's tree.

## Upgrade Definitions

| Upgrade | ID | Base (Lv 0) | Per Level | Max Lv | At Max | Effect |
|---|---|---|---|---|---|---|
| Saw Damage | `saw.damage` | 1 | +1 | 20 | 21 | HP removed per hit |
| Blade Count | `saw.bladeCount` | 1 | +1 | 5 | 6 | Orbiting blade count |
| Spin Speed | `saw.spinSpeed` | 0.005 | +0.005 | 10 | 0.055 | Blade self-rotation rate; tangential impulse pushes chunks |
| Orbit Speed | `saw.orbitSpeed` | 1 rad/s | +0.6 | 10 | 7 rad/s | How fast blades circle the arbor |
| Blade Size | `saw.bladeSize` | 6 px | +2 px | 8 | 22 px radius | Blade collision radius (arbor stays r=20) |

All costs remain placeholder $1 flat. Economy rebalance is deferred per roadmap.

## Base Value Changes

Two existing constants become slower defaults to create upgrade headroom:

- `SAW_ORBIT_RAD_PER_SEC`: 4 -> 1 (now driven by `effectiveParams.orbitSpeed`)
- Blade visual spin rate: 0.02 -> 0.005 (now driven by `effectiveParams.bladeSpinSpeed`)

## Spin Speed — Tangential Impulse

Blade self-rotation becomes gameplay-meaningful. On `collisionactive` between a blade and a chunk, compute the tangential velocity at the contact point based on `bladeSpinSpeed` and the blade radius, then apply it as an impulse to the chunk.

This pushes dead chunks away from the blade and feeds live chunks into contact. At base level (0.005), the push is barely perceptible. At max (0.055), chunks visibly slide along the blade surface.

Implementation: blades remain static bodies with `setPosition` teleportation (approach A from brainstorm). The tangential impulse is applied alongside damage in the collision handler — no physics architecture change.

The impulse direction is perpendicular to the line from blade center to chunk center, in the direction of the blade's spin. The impulse magnitude scales with `bladeSpinSpeed * bladeRadius`.

## Orbit Speed

`SAW_ORBIT_RAD_PER_SEC` becomes `effectiveParams.orbitSpeed`. Base 1 rad/s, upgradeable. Already consumed in `GameScene.update()` where blade positions are computed — just needs to read from `effectiveParams` instead of the constant.

## Blade Size

`SAW_BLADE_RADIUS` becomes `effectiveParams.bladeRadius`. Affects:

1. **Physics body** — `blade.setCircle(radius)` on rebuild
2. **Visual texture** — `makeSawBladeTexture()` must accept a radius parameter and regenerate when size changes
3. **Barrier enforcement** — `enforceWeaponBarriers()` already reads `SAW_BLADE_RADIUS`; must use dynamic value
4. **Blade rebuild trigger** — `recomputeEffectiveParams()` must detect blade size changes and rebuild blades (same as blade count changes)

The arbor radius (20px) never changes. At max blade size (22px), each blade extends past the arbor edge, nearly doubling the saw's effective reach.

## Files Changed

- **`weaponCatalog.ts`** — add 3 `UpgradeDef` entries to the saw's upgrades array
- **`upgradeApplier.ts`** — add `bladeSpinSpeed`, `orbitSpeed`, `bladeRadius` to `EffectiveGameplayParams`; wire `applyUpgrades`
- **`GameScene.ts`** — replace `SAW_ORBIT_RAD_PER_SEC` / `SAW_BLADE_RADIUS` constants with effective params; add tangential impulse in collision handler; dynamic texture regeneration; blade rebuild on size change; update barrier enforcement to use dynamic radius
- **`upgradeApplier.test.ts`** — add test coverage for new params

## Testing

- Vitest: `applyUpgrades` returns correct values for new params at various levels
- Chrome verification: visually confirm blade spin is slow at base, tangential push works, orbit speed feels like a crawl at level 0, blade size visibly grows after upgrade
