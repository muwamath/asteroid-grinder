# Procedural Arena Design

**Status:** draft, brainstormed 2026-04-17.
**Scope:** replace the fixed single-chute arena with a seeded, branching, BSP-generated layout of finite weapon slots. Removes the `Channel Width` upgrade, introduces slot-unlocking as the new mid-run cash sink, adds a `preUnlockedSlots` prestige item. Precedes and gates the §4 economy rebalance on the roadmap.

## Motivation

Current arena is a single vertical chute between two parallel walls, widened by the `Channel Width` upgrade. Weapons can be placed anywhere inside that rectangle. This places no cap on weapon quantity — the economy is driven entirely by scaling buy costs. With prestige now shipped, the roadmap identifies the arena as the next load-bearing system: it must constrain weapon placement, open a prestige-level-gated progression axis, and give the seed-sharing UX something meaningful to differ on. The economy rebalance depends on the arena shape stabilising first.

## Goals

- Every arena is deterministically generated from the existing run seed.
- Arenas visibly differ seed-to-seed (interesting seeds are shareable).
- Weapons occupy a finite set of slots defined by the arena, not free-floating coordinates.
- Slots are locked by default; unlocking is the new mid-run cash sink.
- Prestige unlocks "starts-unlocked" slots as a permanent progression axis.
- Players always have a rescue valve — the first slot unlock per run is free.

## Non-goals

- Economy rebalance (weapon pricing curves, sell-to-zero, asteroid-size curve). That is the §4 roadmap item and depends on this landing first.
- New weapon categories. Existing four weapons + grinder remain unchanged.
- Multiple parallel grinders. Single grinder row across the floor.
- Save-state migration. No current user base — version mismatch wipes localStorage and toasts.

## High-level topology

- **Playfield:** full-screen-edge to full-screen-edge. The current left/right margin is gone.
- **Top:** open sky. No ceiling wall. Asteroids fall in from above.
- **Bottom:** a single grinder row (reused `GrinderBehavior`) along `floorY`. Every generated path must reach the floor band.
- **Sides:** two vertical walls at the screen edges.
- **Interior:** BSP-generated wall segments that fork and merge paths between the top and the floor.
- **Slots:** 4–10 per map (seed-determined), distributed along interior walls of BSP leaves.

## Module structure

New, pure-logic (unit-tested, no Phaser):

- `src/game/arena/arenaTypes.ts` — `ArenaLayout`, `SlotDef`, `WallSegment`, `ArenaSeedParams`, `BspNode`.
- `src/game/arena/arenaGenerator.ts` — `generateArena(seed, params): ArenaLayout`.
- `src/game/arena/arenaValidate.ts` — `isPlayable(layout): boolean` + connectivity/clearance checks.
- `src/game/arena/slotState.ts` — per-run unlock mask, `unlockCost(k)`, `freeUnlockUsed` helper.

New or extended Phaser integration:

- `src/scenes/GameScene.ts` — replaces `rebuildChannelWalls` with `buildArenaFromLayout(layout)`. Removes `clampWeaponToChute` usage. Oscillating spawner. Slot marker rendering.
- `src/scenes/UIScene.ts` — slot interaction HUD: locked slots show unlock cost, unlocked empty slots open the weapon-category picker.

Modified existing:

- `src/game/weaponPlacement.ts` — deleted. Replaced by slot-id binding.
- `src/game/upgradeCatalog.ts` — `channelWidth` entry removed; `asteroidSize` preserved.
- `src/game/upgradeApplier.ts` — `channelHalfWidth` field removed from `EffectiveGameplayParams`.
- `src/game/gameplayState.ts` — adds `unlockedSlotIds: Set<string>`, `freeUnlockUsed: boolean`, `unlockSlot(slotId)`, `installWeapon(slotId, kind)`, `uninstallWeapon(slotId)`. Emits `slotUnlocked`, `weaponInstalled`, `weaponUninstalled`.
- `src/game/saveState.ts` — schema v2 → v3. On load with `version !== 3`: wipe localStorage, toast, start fresh.
- Prestige shop catalog (in `prestigeCatalog.ts`) — adds `preUnlockedSlots` item (levels `0..MAX_SLOTS - 1`).
- `src/main.ts` — `window.__ARENA__` devtools handle.

## Data model

```ts
interface ArenaLayout {
  readonly seed: number;
  readonly walls: readonly WallSegment[];
  readonly slots: readonly SlotDef[];
  readonly floorY: number;
  readonly playfield: { width: number; height: number };
}

interface WallSegment {
  readonly x1: number; readonly y1: number;
  readonly x2: number; readonly y2: number;
}

interface SlotDef {
  readonly id: string;           // stable across a run; generator assigns
  readonly x: number;
  readonly y: number;
  readonly normalAngleRad: number; // which direction the weapon faces
  readonly leafId: string;
}
```

## Generator algorithm

1. Start with the root rectangle (playfield minus floor band).
2. Recursively split. At each node with depth < `MAX_DEPTH` (propose 4), with probability `p_split(depth)` (decaying), choose split axis (vertical weighted 2:1 over horizontal) and position (middle 40–60% of the node).
3. Every produced wall segment is validated for slant: if nearly horizontal (`|angle| < MIN_WALL_SLANT_DEG`, propose 8°), it's rotated to hit the minimum. Horizontal slant guarantees gravity + bouncing evict any stalled chunk.
4. Enforce merge-back: every leaf must connect to the floor band through a downward-monotone path. Non-connecting splits are demoted to partial dividers (triangular / wedge shapes rather than full walls). Max 8 retries reseeding from `seed + retryN`; on full failure the generator returns a safe fallback single-chute layout with 6 slots.
5. Place 0–2 slots per leaf along interior walls, biased toward mid-height. Minimum spacing `2 × MAX_WEAPON_RADIUS` between slots.
6. Trim to target: if total slot count < 4, add slots to largest leaves; if > 10, drop from smallest leaves.
7. Emit `ArenaLayout`. Deterministic and byte-identical for identical seeds + params.

## Physics & rendering

- Each `WallSegment` becomes one static `Matter.Bodies.rectangle` (length × `WALL_COLLIDER_THICKNESS = 40 px`), rotated to match.
- Screen-edge walls built first.
- Slot markers are visual only (no physics body) until a weapon is installed.
- Installed weapon: existing `WeaponBehavior.instantiate()` runs at slot mount point; slot holds the weapon's `instanceId`.
- Unlocked empty slot: dashed yellow circle with "[weapon?]" affordance.
- Locked slot: grey circle with padlock icon and "$N" label.
- Debug overlay: backtick key toggles a BSP-tree / leaf-boundary outline render.

## Spawner

- Oscillating x across the top: `spawnX = playfield.width/2 + amplitude * sin(phase)`. `phase` advances `PHASE_STEP_RAD` per spawn. `amplitude = playfield.width/2 - MAX_ASTEROID_RADIUS - MARGIN`.
- Spawn y is above the top of the visible playfield (asteroids fall into the open sky).
- Legacy `entryMouths` concept not used.

## Economy integration

- **`channelWidth` upgrade is removed entirely.** No replacement in-run upgrade is introduced by this work. Slot unlocking is the new cash sink.
- **Unlock cost curve:** `unlockCost(k) = 0 if k === 0 else UNLOCK_BASE * UNLOCK_GROWTH ^ (k - 1)`. Placeholders `UNLOCK_BASE = 50`, `UNLOCK_GROWTH = 2.5` — re-tuned in the §4 rebalance.
- **First unlock per run is always free.** `freeUnlockUsed` flag tracks it; resets on run start / prestige confirm.
- **Cost is uniform across locked slots** — cheapest next unlock is the same regardless of which slot you click.
- **Prestige shop item `preUnlockedSlots`:** levels `0..MAX_SLOTS - 1`. Starting-unlocked count per run is `min(BASE_STARTING_SLOTS + preUnlockedSlots, totalSlotsOnMap)`. `BASE_STARTING_SLOTS = 2`. Shard cost per level escalates — tuned in the prestige-balance pass.
- Weapon-buy pricing and sell mechanics are unchanged in this scope.

## Save schema

Schema v2 → v3. New fields:
- `arena.seed: number`
- `arena.slotsUnlocked: string[]`
- `arena.freeUnlockUsed: boolean`
- `weaponInstallations: { slotId: string; instanceId: string; state: WeaponState }[]`
- `prestigeUpgrades.preUnlockedSlots: number`

Removed:
- `upgrades.channelWidth`
- Weapon free-floating `(x, y)` positions.

Migration: **none.** On load, if `version !== 3`, wipe localStorage and show a one-time toast ("Save reset — game updated"). Game starts from scratch.

## Prestige interaction

- On prestige confirm: `arena.seed` cleared, `arena.slotsUnlocked` cleared, `freeUnlockUsed` reset, `weaponInstallations` cleared. `prestigeUpgrades.preUnlockedSlots` persists.
- Next run's arena seed is drawn from the run-config seed input if present, otherwise random.
- Seed-sharing UX uses the existing seed input — no new UI surface for v1. `totalSlotsOnMap` preview shown in run config so players can see a seed's slot count before starting.

## Tuning surface

All constants centralised in one `arenaConstants.ts` file:
- `MIN_SLOTS = 4`, `MAX_SLOTS = 10`.
- `BASE_STARTING_SLOTS = 2`.
- `UNLOCK_BASE = 50`, `UNLOCK_GROWTH = 2.5` (placeholder).
- `MAX_DEPTH = 4`, `SPLIT_P_DECAY = 0.6`, vertical-axis bias `2:1`.
- `MIN_WALL_SLANT_DEG = 8`.
- `WALL_COLLIDER_THICKNESS = 40` (matches current channel walls).
- `PHASE_STEP_RAD = 0.37` (tunable).

## Testing

Unit (Vitest):
- `arenaGenerator.test.ts` — determinism, slot-count bounds, connectivity invariant, slot-spacing invariant, horizontal-slant invariant, retry-fallback on pathological seed.
- `slotState.test.ts` — first unlock is free; curve for k ≥ 1; `freeUnlockUsed` semantics; starting-unlocked clamp to `totalSlotsOnMap`.
- `gameplayState.test.ts` — `unlockSlot` / `installWeapon` / `uninstallWeapon` side effects, event emission, mask integrity across install → sell → reinstall.
- `saveState.test.ts` — v3 round-trip; v2/v1 fixture → wipe + return null, no throw.
- `prestigeCatalog.test.ts` — `preUnlockedSlots` Shard debits, level cap, persists through prestige.

Playwright (`tests/e2e/`):
- `smoke.spec.ts` extended — at least one slot visible; asteroids still reach floor; clean console.
- `arena-seed.spec.ts` new — set known seed via run config, snapshot BSP debug-overlay state, assert rendered slot positions match the snapshot.

Test-count bookkeeping: expect roughly +12 cases across +2 new test files. Bump the number in `CLAUDE.md` when the work lands.

## Design invariants (additions to `DESIGN_INVARIANTS.md`)

- Arena is deterministic from `runSeed`; every leaf reaches the floor.
- First slot unlock per run is free — load-bearing rescue valve.
- Horizontal wall segments carry `|angle| ≥ MIN_WALL_SLANT_DEG` to prevent chunk stalling.
- Save version mismatch wipes localStorage and toasts — no migration code.

## Open follow-ups deferred to later roadmap items

- Tuning the placeholder unlock-cost curve (§4 economy rebalance).
- Typed / category-locked slots, per the earlier "Option C" slot model, added by tagging existing `SlotDef`s — not in v1 scope.
- "Copy current seed" button and richer seed-share UX polish.
- Hand-authored tile library (Option C from the generator brainstorm) as a later B → C migration.
