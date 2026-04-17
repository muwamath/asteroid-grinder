# Asteroid Grinder Roadmap

Living document. MVP shipped **2026-04-16** — core loop, 9-tier material ladder, 4 weapons behind `WeaponBehavior`, compound-body asteroids, save/offline, options menu, GH Pages deploy. Phases 1–10 complete; see git history for details.

Backlog below is grouped by **what it adds to the game**. Order is execution order: hygiene + QoL first (lock down the foundation before piling on), then the value-adds.

---

## 1c. Arena follow-ups — done (2026-04-17)

- ✅ Removed dead `_allSlotIds` + `allSlotIds` getter from `gameplayState`.
- ✅ Removed orphan `SlotMask` class + its tests; gameplayState is the sole slot-state runtime.
- ✅ Removed transitional `channelHalfWidth` field from `EffectiveGameplayParams`; `grinderBehavior`, `missileBehavior`, `GameScene.enforceWalls` + `onWeaponCountChanged` now read `scene.scale.width` directly.
- ✅ `arenaGenerator.ensureSlant` endpoints clamped to `[0, playfield.width] × [0, floorY]` so walls never escape screen-edge colliders.

## 1b. Bug — weapons can spawn overlapping grinders — resolved (2026-04-17)

Obsolete under slot-bound weapons: every slot is placed at least `MIN_SLOT_FLOOR_CLEARANCE` (160 px) above the grinder row by the generator, so weapons installed at slots can never clip grinder blades.

## 1a. Bug — weapon position sanity check on load — done (2026-04-16)

- ✅ **Weapons are clamped to the current chute on load.** Saved `(x,y)` is clamped into the valid chute rectangle for the weapon's `bodyRadius`. If the chute can't fit the weapon at any position (narrower than `r + 8` per side, or shorter than the weapon diameter vertically), the instance is silently sold for $1 and the weapon count is decremented so the UI reflects the post-sell state. Pure math lives in `src/game/weaponPlacement.ts` + unit tests.

## 1. Tech hygiene — done (2026-04-16)

Shipped on `feature/tech-hygiene`, FF-merged to main.

- ✅ `DESIGN_INVARIANTS.md` at repo root, referenced from `CLAUDE.md`. Load-bearing behaviors documented.
- ✅ Playwright golden-path smoke in `tests/e2e/smoke.spec.ts` — boots game, waits 30s (L0 Fall Speed gives ~40s arena crossing), asserts spawned asteroids, non-zero saw hits, rotating live bodies, clean console. `npm run test:e2e`.
- ✅ Multi-saw collision routing — blades carry their arbor's `instanceId`; `GameScene.handleContact` routes to the owning instance instead of the first weapon with `handleCompoundHit`.
- ✅ Saw cooldown scoped per-asteroid — `lastHitAt` keyed `${asteroid.id}/${chunkId}`, pruned every 1s, entries older than 1s dropped.
- ✅ Zero-chunk asteroid de-listed + destroyed in `damageLiveChunk`'s 0-component branch rather than waiting for the next tick's `isAlive` guard.

**Deferred:** CI action versions (`actions/*@v4/v5` → Node 20 deprecated June 2026). Bump when replacements ship.

## 2. Quality of life

Smaller player-facing wins. Land before content so resolution/layout changes don't invalidate later art work.

- ✅ **Text crispness on HiDPI displays.** Shipped 2026-04-16. Bumped base canvas to 2560×1440 (1:1 on retina) and swept all UI/arena/weapon layout constants; added fullscreen toggle (F key + options menu). Font sizes, panel sizes, death line, channel top, weapon radii all doubled. `channelHalfWidth` + gravity left untouched by explicit call — channel reads narrower and chunks fall slightly slower, tolerated for now.
- **Chunk containment.** Intentional — flying chunks from high-velocity saw hits stay in the game. (Confirmed 2026-04-16: not a bug, won't fix.)
- ✅ **Saw direction on double-click.** Shipped 2026-04-16. Each saw owns its direction (per-instance, no global setting); double-click the arbor to reverse THIS saw. Drag-distance threshold raised to 6px so click jitter no longer eats the toggle. CW/CCW menu buttons removed. Save/load round-trips per-saw direction.

## 3. New gameplay systems

Biggest adds — new reasons to keep playing.

- ✅ **Prestige / meta loop — asteroid cores.** Shipped 2026-04-17. `isCore` chunks became vaults (10× HP, Shard drop). Two-bucket material model: filler (t1 Dirt coin-flip) + tiered (Gaussian over t2–t9 shifting with Asteroid Quality). Prestige confirm banks pending Shards, wipes cash/upgrades/weapons, seeds offline cap from prestige level. 11-entry persistent shop (4 free-weapon slots, cash/damage/discount multipliers, Refinement, offline-cap, Shard yield, starting cash). Minimal Run Config (seed input + re-roll + Start) → seeded spawner for reproducible runs. Save state v1→v2 migration. Spec: `docs/superpowers/specs/2026-04-16-prestige-system-design.md`; plan: `docs/superpowers/plans/2026-04-17-prestige-system.md`.
  - ✅ **Offline-earnings cap extender.** Shipped as `offline.cap` prestige upgrade (8h → 12h → 24h → 48h).
- **More weapons.** Tesla Coil, Freeze Ray, Flak Cannon, Gravity Well, Rail Gun, Drone Swarm (from the Unity prototype backlog). One `WeaponBehavior` file + catalog entry each.
- ✅ **Arena overhaul.** Shipped 2026-04-17. Walls extend to screen edges; open top with an oscillating spawner sweeping horizontally; seeded BSP generator produces branching channel networks with 4–10 finite weapon slots per map. Slots are locked by default — first unlock per run free (rescue valve), subsequent unlocks follow an escalating placeholder cost curve. Prestige shop gains `arena.preUnlockedSlots` (+1 starting-unlocked slot per level, cap 9). `Channel Width` upgrade removed; `Asteroid Size` retained. Save schema bumped v2→v3 with wipe-on-mismatch (no user base yet). F2 toggles a BSP / slot debug overlay. Spec: `docs/superpowers/specs/2026-04-17-procedural-arena-design.md`; plan: `docs/superpowers/plans/2026-04-17-procedural-arena.md`.
- **Saw shape library.** Purchase unlocks alternate blade silhouettes (circular, bladed, star, crescent). Needs a `SawShape` concept (sprite + collider profile per shape) plus a selector UI.
- ✅ **Grinder overhaul.** Shipped 2026-04-16. Replaced the red-line death boundary with a `GrinderBehavior` — a row of counter-rotating rectangular blades (16w × 48h) tiled across the channel bottom. Live chunks collide with blades; dead chunks pass through via `CAT_DEAD_CHUNK` collision category. Three upgrades: Grinder Damage / Spin Speed / Blade Size. Kill-attribution plumbing added (`killerType` on dead chunks) so grinder kills pay flat $1 while weapon kills keep tier-scaled reward. Death line retained as visual failsafe behind blades. Chew particles deferred to §5 art pass.

## 4. Economy & balance

Makes progression feel earned.

- **Upgrade audit — every item, every stat.** Walk through every entry in `weaponCatalog.ts` (saw / laser / missile / blackhole / grinder) and the `asteroids.*` category. For each: confirm the upgrade exists, its per-level delta feels right, its max level is coherent, and its cost curve is something other than placeholder `$1`. Explicitly include the **spawner** — add upgrades for spawn interval, spawn amplitude, and anything else that governs the asteroid-incoming pipeline (currently only `asteroids.dropRate` exists). This audit is the single source of truth feeding the rebalance below.
- **Economy rebalance.** All costs are placeholder ($1 flat). Needs exponential scaling, per-weapon buy curves, sell refund formula, upgrade cost tuning. Must land before/with any of the new gameplay systems above.
- **Sell the last weapon; link buy prices.** ✅ Selling-to-zero shipped 2026-04-17 with the code-review fix pass. *Remaining:* link buy prices globally — the Nth weapon of any type costs the same, not per-type. Roll into the rebalance.
- **Code-review follow-ups (deferred to later polish, 2026-04-17):**
  - `startNewRun` should call `ui.closeAllPanels()` before `stop+start` so any open Phaser-canvas sub-panel doesn't dangle briefly during the transition.
  - Run Config map preview assumes `scale.width/height` matches the arena's generation dimensions — document this in a comment so a scale-mode change doesn't silently break the preview.
  - Re-roll button double-fires on desktop (`pointerdown` + `click` both call `rerollFn`), causing the shown seed to differ from the first-displayed one. Remove one listener.
- **"Larger sooner" asteroid curve.** Current Asteroid Size upgrade starts at 4 chunks and adds linearly. Desired: grow more, faster early (non-linear, Fibonacci-ish) so the game feels meaty quickly.
- **Slower wall expansion.** Channel Width upgrade should widen by smaller increments or scale cost more aggressively — progression should feel earned. *(Note: Channel Width was removed with the procedural arena; this may be obsolete — revisit during the audit.)*

## 5. Art & audio pass

Visual and sonic polish.

- Palette tuning, particle polish, general readability pass.
- Shop-panel styling: typography, spacing, framing, hover/press feedback, category icon art.
- **Live-demo category icons** — render each category's hero entity into the button (e.g. a miniature spinning saw inside the Saw icon).
- **Background pass.** Flat `#1a1a28` → stars / nebula gradient / parallax / subtle animated field. Should read as "space" without distracting.
- Spark-burst upgrade: swap the procedural 1×1 white for a star/plus glyph, warmer toward centre.
- Saw hub + blade sprites: bump procedural 64×64 art or ship proper assets.
- **Lo-fi audio loop + chunky SFX.** New domain — no audio exists yet.

## 6. Scope expansions

Maybe-later.

- Achievements, cosmetics.
- **Per-weapon DPS / contribution overlay.** Kill-attribution plumbing (added in the grinder overhaul — tracks `killerType` on every chunk death) unlocks a dev/player overlay showing cash/sec and kill share by weapon type. Useful for balance tuning and for players comparing loadouts. Would also be a natural moment to rename the stale `cashFromSaw` / `cashFromLine` / `killedBySaw` debug counters in `GameScene.ts` to per-weapon maps.
