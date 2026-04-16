# Laser Weapon — Design Spec

Single-chunk targeting turret with sticky aim, continuous DPS beam, and cooldown between targets.

## Visual

A simple square (same footprint as arbor, ~40x40px) with one side visually marked (bright edge or notch) indicating the barrel direction. The beam is a red line from the barrel to the target chunk. No particles, no sparkle — MVP only.

## Physics

- Static body, same size as arbor (r=20 equivalent — 40x40 square or r=20 circle)
- Blocks chunks physically (like the arbor)
- Draggable within the channel (same drag logic as saw)
- Beam is visual + damage only, not a physics body

## Targeting

- **Sticky aim:** locks onto a chunk and keeps firing until it dies or leaves range
- **Angular preference:** when selecting a new target, prefers chunks closer to current aim direction (angular + distance scoring)
- **Fire cone:** only fires when aimed within 15 degrees of target
- **Cooldown:** after target loss, cannot acquire new target for `cooldownDuration` seconds
- **Initial stagger:** random delay on spawn (0 to cooldownDuration) so multiple lasers don't sync
- **Range check:** drops target if it moves beyond maxRange
- **Ignores dead chunks**

## Damage

Continuous DPS while beam is on target. Applied per-frame: `damage * (delta / 1000)` HP removed per tick.

## Upgrade Definitions

| Upgrade | ID | Base | Per Level | Max Lv | At Max | Effect |
|---|---|---|---|---|---|---|
| Aim Speed | `laser.aimSpeed` | 30 deg/s | +16.5 | 20 | 360 deg/s | Rotation speed to new target |
| Range | `laser.range` | 60 px | +20 | 20 | 460 px | Beam reach distance |
| Damage | `laser.damage` | 1 DPS | +0.5 | 20 | 11 DPS | Continuous damage while firing |
| Cooldown | `laser.cooldown` | 2s | -0.095 | 20 | 0.1s | Refire delay after target loss |

All costs remain placeholder $1 flat. (Note: Unity had unlimited damage levels — capping at 20 for now to match other upgrades.)

## Files to Create/Modify

- **Create: `src/game/laser.ts`** — Laser class: targeting logic, aim rotation, beam state, damage application
- **Modify: `src/game/weaponCatalog.ts`** — unlock laser, add 4 upgrade defs
- **Modify: `src/game/upgradeApplier.ts`** — add laser params to EffectiveGameplayParams
- **Modify: `src/scenes/GameScene.ts`** — laser texture, spawn/destroy laser instances, update loop (rotation + beam + damage), drag support
- **Modify: `src/game/upgradeApplier.test.ts`** — test coverage for laser params

## Out of Scope

- Beam particles / sparkle effects (art pass)
- Beam physics (beam doesn't block chunks)
- Sound effects
- Laser-specific UI beyond the existing weapon bar pattern
