# Missile Weapon — Design Spec

Missile launcher turret that fires homing projectiles with AOE detonation on live chunks.

## Visual — MVP

Launcher: same size as arbor (r=20 circle body, ~40px), dark green square with bright barrel edge. Same draggable pattern as laser/saw.

Projectile: small rectangle (8x4px) that rotates to face its movement direction. Simple, no trails or particles.

Explosion: brief expanding circle flash at detonation point. Minimal juice.

## Physics

- **Launcher:** static body, blocks all chunks (alive + dead). Draggable in channel.
- **Projectile:** visual-only, no physics body. Position-based detonation via AABB overlap check against live chunks each frame.
- **AOE detonation:** damages all live chunks within blast radius. Dead chunks are unaffected.

## Targeting (Launcher)

- Scans all alive chunks within range
- Scoring: distance + angular difference (prefers close + aligned targets)
- **Lead targeting:** quadratic intercept prediction — aims at where the target will be when the missile arrives, not where it is now
- Rotation speed: 360 deg/s (fast — the challenge is the missile travel, not the aiming)
- Fire condition: within 10 degrees of intercept point
- Fire interval: cooldown between shots (upgradeable)

## Projectile Behavior

- Launches in the aimed direction at `speed` px/s
- **Homing:** per-frame lerp toward target's current position. Strength 0 at base (straight line), upgradeable to 5 (sharp curves). `direction = lerp(direction, toTarget, homingStrength * dt).normalized`
- **Detonation triggers:**
  1. Contact: AABB overlap with any live chunk (dead chunks ignored)
  2. Wall: position outside channel bounds
  3. Timeout: 10 seconds max lifetime
- On detonation: flat damage to all live chunks within blast radius. No falloff.
- Max active missiles: no cap (fire-and-forget)

## Upgrade Definitions

| Upgrade | ID | Base | Per Level | Max Lv | At Max | Effect |
|---|---|---|---|---|---|---|
| Fire Rate | `missile.fireRate` | 5s | -0.225 | 20 | 0.5s | Interval between shots |
| Damage | `missile.damage` | 2 | +1.5 | 20 | 32 | AOE damage per missile |
| Blast Radius | `missile.blastRadius` | 20 px | +4 | 20 | 100 px | Explosion AOE radius |
| Speed | `missile.speed` | 80 px/s | +12 | 20 | 320 px/s | Projectile velocity |
| Homing | `missile.homing` | 0 | +0.5 | 10 | 5 | Tracking strength per frame |

All costs placeholder $1 flat.

Note: Unity values converted to pixel units. Blast radius 20px base ≈ 1.7 chunk widths. Speed 80px/s ≈ reasonable travel time across channel. Range fixed at 400px (most of the channel height).

## Files to Create/Modify

- **Create: `src/game/missile.ts`** — MissileLauncher class (targeting, lead intercept, fire timing) + MissileProjectile class (movement, homing, detonation)
- **Modify: `src/game/weaponCatalog.ts`** — unlock missile, add 5 upgrade defs
- **Modify: `src/game/upgradeApplier.ts`** — add missile params to EffectiveGameplayParams
- **Modify: `src/scenes/GameScene.ts`** — missile texture, projectile texture, spawn/destroy, update loop (launcher + active projectiles), AOE damage, explosion visual
- **Modify: `src/game/upgradeApplier.test.ts`** — test coverage for missile params

## Out of Scope

- Missile trails / smoke particles (art pass)
- Detailed explosion animation (art pass)
- Sound effects
- Min range / dead zone
