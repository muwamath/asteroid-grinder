# Grinder Overhaul — Design

**Status:** Approved, ready for implementation plan
**Date:** 2026-04-16
**Branch target:** `feature/grinder-overhaul`
**ROADMAP anchor:** §3 "Grinder overhaul" (creation / upgrades / visuals)

## Problem

Today the grinder is three hardcoded lines in `GameScene.ts`:

1. `DEATH_LINE_Y = 1304` constant.
2. A red 6px rectangle drawn at that Y.
3. An `update()` loop that calls `damageLiveChunk(..., Infinity)` on any live chunk below the line.

This violates the project's weapon-abstraction pattern (every other weapon implements `WeaponBehavior`), gives the grinder no upgrades, no visual identity, and no mechanical nuance. The grinder is also the **namesake of the game**, yet presents as a one-pixel death strip.

## Design goals

1. **Grinder becomes a proper `WeaponBehavior`** — single instance, but with internal blade-array mechanics.
2. **Visible rotating blades** — counter-rotating rectangles tiled across the channel bottom. Industrial paper-shredder vibe.
3. **Live chunks collide with blades and take damage (saw-style).** Nothing live makes it past.
4. **Dead chunks pass through blades** and reach the death line for collection.
5. **Kill attribution is tracked.** Grinder kills pay flat $1; other weapons pay tier-scaled reward even if the corpse rolls past the grinder afterward.
6. **Real upgrades.** Grinder Damage, Spin Speed, Blade Size.
7. **No buying, no selling, no dragging, not multi-instance.** The grinder is the floor of the arena, not a tool you place.

## Identity / lore

The grinder is what the game is named after. It's a row of rotating rectangular blades at the bottom of the chute, with alternating rotation direction per blade — like an industrial shredder. It's the floor; every chunk eventually meets the grinder one way or another. Its payout is deliberately terrible ($1) because letting the grinder do the work is the **lazy** path — weapons reward you for doing the killing yourself.

## §1 — Architecture

### New file: `src/game/weapons/grinderBehavior.ts`

Implements `WeaponBehavior`. One instance per logical grinder (always exactly 1, created at scene start, not draggable, not sellable, not buyable). The behavior owns:

- `blades: Array<{ body: MatterJS.BodyType, sprite: Phaser.GameObjects.Image, direction: 1 | -1 }>` — rotating rectangles.
- `housingSprite` — thin decorative base along the channel bottom, returned as the public `sprite` for abstraction consistency (drag is disabled for grinder).
- `retile(channelWidth, bladeScale)` — rebuilds the blade array when channel width or blade-size upgrade changes. Blades always fill edge-to-edge of the channel.
- `omega: number` — angular velocity magnitude (rad/sec), updated on spin-speed upgrade.
- `damage: number` — effective per-contact damage, updated on damage upgrade.

### Collision routing

Each blade body carries `plugin.weaponInstanceId = grinder.instanceId`, matching the existing multi-saw routing established in the tech-hygiene phase. `GameScene.handleContact` dispatches to `GrinderBehavior.handleCompoundHit(asteroid, chunkId, bladeBody, params, scene)` which calls `damageLiveChunk(..., 'grinder')`.

### GameScene changes

- **Remove** the `toGrind` live-chunk loop in `update()` that calls `damageLiveChunk(..., Infinity)` on any `chunk.bodyPart.position.y > DEATH_LINE_Y`. The grinder does the killing now, not a position check.
- **Keep** `DEATH_LINE_Y` as a constant. It's still needed for:
  - Dead-chunk collection Y-threshold (corpses fall through blades, land past them, get collected).
  - Dragging bounds for other weapons (`dragY < DEATH_LINE_Y - r - 8`).
  - Channel-wall vertical extents.
- **Spawn a single grinder instance** at scene start (before other weapons, so it's the lowest in the instance-z).
- **Death-line visual strip** now drawn BEHIND blades (lower `setDepth`).

### Files touched

| File | Change |
|---|---|
| ➕ `src/game/weapons/grinderBehavior.ts` | New file, implements `WeaponBehavior` |
| ✏️ `src/game/weaponCatalog.ts` | Grinder gets 3 upgrade defs |
| ✏️ `src/scenes/GameScene.ts` | Spawn grinder; remove `toGrind` loop; depth-reorder death line |
| ✏️ `src/game/upgradeApplier.ts` | Expose `grinderDamage` / `grinderSpinSpeed` / `grinderBladeScale` on `EffectiveGameplayParams` |
| ✏️ `src/scenes/UIScene.ts` | Remove grinder exclusion from upgrade list gate (L375); keep buy/sell hidden (L439) |
| ✏️ `src/game/compoundAsteroid.ts` | `damageLiveChunk` signature gains `killerType: WeaponKillSource`; sets `CAT_DEAD_CHUNK` filter on loose dead chunks |
| ✏️ `src/game/weapons/sawBehavior.ts` | Pass `'saw'` into `damageLiveChunk` |
| ✏️ `src/game/weapons/laserBehavior.ts` | Pass `'laser'` |
| ✏️ `src/game/weapons/missileBehavior.ts` | Pass `'missile'` |
| ✏️ `src/game/weapons/blackholeBehavior.ts` | Pass `'blackhole'` |
| ✏️ `DESIGN_INVARIANTS.md` | Add grinder invariants |
| ✏️ `ROADMAP.md` | Mark §3 grinder overhaul done |
| ✏️ `README.md` | Mention grinder upgrades in feature list |

**No schema bump needed in `saveState.ts`** — grinder upgrade levels slot into the existing generic `upgradeLevels` map keyed by upgrade ID. Old saves without these keys default to level 0 → behaves like current game for grinder effects (with a visual upgrade, since blades appear regardless).

## §2 — Physics & collision filter

### Blade bodies

- **Static** `Matter.Bodies.rectangle`, one per blade.
- Positioned in a row just above `DEATH_LINE_Y`.
- **Rotation** via `Matter.Body.setAngle(body, newAngle)` each tick — same pattern as the orbiting saw blades (static bodies don't support `setAngularVelocity`).
- Direction per blade: `i % 2 === 0 ? +1 : -1`. Blade 0 CW, blade 1 CCW, alternating. Counter-rotation is **load-bearing** for the "chewing" feel.

### Collision filter for dead-chunk passthrough

Matter exposes `body.collisionFilter = { category, mask, group }`. New categories:

- `CAT_GRINDER_BLADE = 0x0008` — set on every grinder blade body.
- `CAT_DEAD_CHUNK = 0x0010` — set on dead chunks at the moment of death.

Masks:
- Blade `mask` **excludes** `CAT_DEAD_CHUNK` (keeps everything else).
- Dead chunk `mask` **excludes** `CAT_GRINDER_BLADE` (keeps everything else — still collides with walls, other dead chunks, etc.).
- Live chunks keep their current filter → collide with blades normally.

**Death transition.** When `damageLiveChunk` extracts a chunk as a loose dead body (via `CompoundAsteroid.extractAsDead` or equivalent path), the newly-created dead chunk's `collisionFilter.category |= CAT_DEAD_CHUNK`. Clean one-way transition. Missed-filter bug would lock dead chunks on top of blades — flagged in DESIGN_INVARIANTS.

### Dead-chunk collection

Unchanged: dead chunks with `y > DEATH_LINE_Y` are collected by `collectDeadAtDeathLine`. Since they pass through blades, they reach the line and get collected. Reward was attributed at kill-time (§3), so collection does not re-award.

### Blade layout geometry

- `bladeWidth = BLADE_WIDTH_BASE * bladeScale` (tuning TBD)
- `bladeHeight = BLADE_HEIGHT_BASE * bladeScale` (tuning TBD)
- `N = ceil(channelWidth / bladeWidth)` — count derived, not upgraded
- Blades evenly redistributed so total span = exact channel width (last-blade rounding absorbed)
- Blade center Y = `DEATH_LINE_Y - bladeHeight/2 - GRINDER_CLEARANCE` (clearance TBD)
- `retile()` called on: (a) Channel Width upgrade purchase, (b) Blade Size upgrade purchase

### Invariants

- Grinder blades are static (like saws) — manually `setAngle` per tick.
- Matter doesn't generate pairs between two statics → blades never collide with each other or with static arena walls. Intentional.
- Blade bodies do NOT have `gameObject` set (created via `Matter.Bodies.rectangle`, not `this.matter.add.*`) — match the existing arena-wall pattern; collision handler must check for undefined `gameObject`.

## §3 — Kill attribution & $1 payout

### Attribution rule

**Last-hit wins.** Whichever weapon lands the fatal damage takes kill credit.

### Implementation

`damageLiveChunk` signature gains a `killerType` parameter. Current signature on `GameScene`:

```ts
damageLiveChunk(ast: CompoundAsteroid, chunkId: string, amount: number): boolean
```

Becomes:

```ts
type WeaponKillSource = 'saw' | 'laser' | 'missile' | 'blackhole' | 'grinder';

damageLiveChunk(
  ast: CompoundAsteroid,
  chunkId: string,
  amount: number,
  killerType: WeaponKillSource,
): boolean
```

The `WeaponBehavior`-facing shim (currently on `SawSceneAccess`-style interface in saw / callback-style in blackhole L345) is extended the same way. All existing call sites (saw contact handler, laser tick, missile detonate, blackhole core damage callback) pass their weapon type — one-line edit each.

### Reward rule

When `killed === true`:

```ts
const reward = killerType === 'grinder' ? 1 : materialTier.reward;
gameplayState.addCash(reward);
```

The `1` is the intended flat grinder payout, not a placeholder — explicitly stated by user. Not subject to the economy-rebalance phase.

### Edge cases

| Scenario | Killer | Reward |
|---|---|---|
| Saw chips chunk to 1 HP, chunk rolls onto blade, blade kills | grinder | **$1** |
| Saw chips to 1 HP, different saw pass kills it | saw | tier-scaled |
| Grinder chips at chunk over time, missile kills it | missile | tier-scaled |
| Blackhole core damage kills chunk mid-air | blackhole | tier-scaled |
| Dead chunk from saw kill rolls past grinder to death line | (already dead at saw) | tier-scaled (attributed at kill, not collection) |

### Accounting

- `cashRate.ts` EMA tracker is reward-agnostic (just tracks cash/sec) — no changes.
- Offline-progress calculation is coarse-grained (no per-weapon attribution) — untouched.
- Kill-attribution plumbing is infrastructure that enables a future per-weapon DPS overlay (added to ROADMAP §6 backlog).

## §4 — Upgrades & catalog wiring

### `weaponCatalog.ts` — grinder upgrades

```ts
upgrades: [
  { id: 'grinder.damage',    name: 'Grinder Damage', description: '+damage per blade contact',  category: 'grinder', baseCost: 1, growthRate: 1, maxLevel: 20 },
  { id: 'grinder.spinSpeed', name: 'Spin Speed',     description: 'Blades spin faster',         category: 'grinder', baseCost: 1, growthRate: 1, maxLevel: 10 },
  { id: 'grinder.bladeSize', name: 'Blade Size',     description: 'Taller blades reach higher', category: 'grinder', baseCost: 1, growthRate: 1, maxLevel: 8 },
],
```

Costs placeholder `$1` per economy-deferred convention. Final baseCost / growthRate / per-level effect magnitudes TBD at implementation — will ask user for tuning values, not guess.

### `EffectiveGameplayParams` new fields

```ts
grinderDamage: number;       // effective per-contact damage
grinderSpinSpeed: number;    // rad/sec magnitude
grinderBladeScale: number;   // multiplier on BLADE_WIDTH_BASE / BLADE_HEIGHT_BASE
```

Applier formulas: linear ramp over levels; final magnitudes TBD.

### `GrinderBehavior.onUpgrade(prev, next)`

- `spinSpeed` diff → update `this.omega`.
- `bladeScale` or channel width changed → call `retile(channelWidth, bladeScale)`.
- `damage` diff → update `this.damage`.

### UI impact (`UIScene.ts`)

- L375 currently: `if (isWeapon && !this.isLocked && def.id !== 'grinder')` — **remove the `def.id !== 'grinder'` clause**. Upgrade list now appears for grinder.
- L439: `showBuySell = isWeapon && def.id !== 'grinder'` — **keep as-is**. No buy/sell for grinder.
- L496: header stays `wDef.name` (no `×count`).
- L521: panel height is already dynamic based on visible rows — grows with new upgrade buttons automatically.

### Save/load

- Upgrade levels serialize via the generic `upgradeLevels` map keyed by upgrade ID.
- New `grinder.*` keys just slot in. No schema version bump. Default level 0 for missing keys.

## §5 — Visuals

### Blade rendering

Procedural texture per blade:

- Fill: medium-dark grey `#4a4e58`.
- Midline horizontal stripe: lighter grey `#7a818c`, ~25% of blade height — makes rotation visually obvious.
- 1px outline: `#2a2d33` for silhouette clarity.
- Size follows §2 geometry (auto-tiled width, scale-driven height).

### Counter-rotation

Alternating directions per blade. Neighbors spinning opposite directions give the "chewing/pulling in" feel — Matter friction between chunks and opposing blade faces produces a natural grind without any extra force code.

### Housing / frame

Thin horizontal base sprite along channel bottom, wall-to-wall, `#2a2d33` color, ~8px tall. Decorative — no physics body. Visual anchor saying "blades are mounted on something."

### Death-line treatment

- Current: `#ff3355` red strip, 6px, alpha 0.9 at `DEATH_LINE_Y`.
- New: same strip but `setDepth` **below** blades & housing. Mostly obscured during normal play; if a live chunk ever made it past (bug), the exposed red line makes the failure obvious.

### Z-order (front → back)

1. Flying chunks (live + dead)
2. Grinder blades
3. Housing frame
4. Red death-line strip
5. Channel walls (visual)
6. Background

### Rotation loop

In `GrinderBehavior.update(scene, _sprite, delta)`:

```ts
for (const blade of this.blades) {
  const newAngle = blade.body.angle + blade.direction * this.omega * (delta / 1000);
  Matter.Body.setAngle(blade.body, newAngle);
  blade.sprite.setRotation(newAngle);
}
```

### Chew particles — out of scope

Particle sparks / dust at blade-chunk contact points: deferred to §5 art pass. Functional mechanic ships now; particle layer bolts on later without gameplay changes.

## §6 — Testing, invariants, out-of-scope

### Unit tests (vitest)

- ➕ `grinderBehavior.test.ts` — blade count tiling given various channel widths and blade scales.
- ✏️ `upgradeApplier.test.ts` — grinder upgrade levels produce correct `grinderDamage`, `grinderSpinSpeed`, `grinderBladeScale` values.
- ✏️ `weaponCatalog.test.ts` — grinder now has exactly 3 upgrade defs; all prefixed `grinder.`.
- Kill attribution — pure-logic test of the reward-by-killer mapping if extractable into a helper; otherwise covered by e2e.

### Playwright smoke (`tests/e2e/smoke.spec.ts` extension)

- Wait for first grinder kill → assert `+1` cashChanged event.
- Sample a blade body's angle at t=0 and t=2s → assert angle changed (rotation alive).
- Assert dead chunks reach collection zone (log counter).

### DESIGN_INVARIANTS.md additions

1. **Grinder kills pay flat $1.** Other weapons pay tier-scaled reward. Attribution = last-hit. New weapons must pass their type into `damageLiveChunk(..., killerType)`.
2. **Counter-rotating grinder blades are load-bearing.** Don't unify direction — neighbors spinning opposite is what gives the chewing feel.
3. **Dead chunks carry `CAT_DEAD_CHUNK` collision category and pass through grinder blades.** Live chunks collide. Set the filter in the death-transition code path — missing this bricks the grinder (corpses lock on top of blades).
4. **Grinder width always = channel width.** Blade Size scales blade dimensions; Channel Width upgrade triggers retile. Don't introduce a separate grinder-width constant.

### Out of scope

- Chew particles / SFX → §5 art pass.
- Live DPS overlay → §6 scope expansions (added to ROADMAP this session).
- Offline progress grinder-kill attribution → offline math is coarse-grained, untouched.
- Sellability, dragging, multi-instance → explicitly rejected in brainstorming.

### Tuning deferred

Per the gameplay-tuning-sacrosanct rule, will ask user for:
- `BLADE_WIDTH_BASE`, `BLADE_HEIGHT_BASE` (px)
- `GRINDER_CLEARANCE` (px, blade-top to death-line gap)
- `BASE_GRINDER_DAMAGE` (HP per contact at level 0)
- `BASE_GRINDER_SPIN` (rad/s magnitude at level 0)
- Per-upgrade growth magnitudes
- Real `baseCost` / `growthRate` (still $1 placeholder for MVP per economy-deferred)

## Workflow

- Feature branch `feature/grinder-overhaul`.
- Phased implementation plan with code-review pass as second-to-last phase, live Chrome verification last.
- Single FF-merge to `main` once live build at https://muwamath.github.io/asteroid-grinder/ is validated with grinder visible, rotating, killing live chunks for $1, passing dead chunks, upgrade panel functional.
- Commits per logical unit. ROADMAP.md § 3 grinder bullet marked done in the merge commit.
