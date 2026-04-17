# Design Invariants

Load-bearing behaviors that are easy to silently break during refactors. Each entry is a **fact** the game depends on — if one of these stops being true, it's almost certainly a regression, not an improvement. Verify against this list when touching related code; add new invariants as load-bearing decisions land.

Paired with the Playwright golden-path smoke test (`tests/e2e/smoke.spec.ts`), which acts as a tripwire for a subset of these.

---

## Arena & physics

- **Canvas is 2560×1440, 16:9, `Scale.FIT`.** Gameplay tuning, spawn positions, death line — all hard-coded pixel constants against this base. Fullscreen target is the `#game` div (`fullscreenTarget: 'game'`) with `:fullscreen` CSS stripping padding and canvas border-radius.
- **Arena is seeded + procedurally generated.** Every boot runs the BSP generator in `src/game/arena/arenaGenerator.ts` keyed on the current `runSeed`. Layouts are deterministic: same seed ⇒ byte-identical `ArenaLayout` (walls, slots, floorY). Spec: `docs/superpowers/specs/2026-04-17-procedural-arena-design.md`.
- **Generator output always passes `isPlayable`.** Every x-sample across the playfield can reach the floor with adequate clearance. If a seed fails validation up to `MAX_RETRIES` times, the generator returns a safe fallback straight-chute layout (6 slots, no interior walls). Never ship an arena that hasn't been validated.
- **Slot count is bounded `[MIN_SLOTS=4, MAX_SLOTS=10]`.** Variable per seed (that's the payoff for seed-sharing). Exceeding this range silently breaks the prestige `preUnlockedSlots` cap — keep it enforced in the generator.
- **First slot unlock per run is free.** `unlockCost(0) === 0` in `slotState.ts`. Load-bearing rescue valve if the player gets stuck with no cash — never cost-gate the first click.
- **Horizontal wall segments carry `|angle| ≥ MIN_WALL_SLANT_DEG` (8°).** `ensureSlant` in the generator rotates any too-flat segment around its midpoint. Without this, chunks pile and stall on a flat ledge; gravity alone can't evict them.
- **Death line is `DEATH_LINE_Y = 1304`.** Dead chunks falling past this collect cash and despawn. Live chunks from surviving asteroids are culled below this line too. NOTE: `missileBehavior.ts` keeps a private duplicate of this constant — update both when moving the line.
- **Asteroids spawn at `SPAWN_Y = -80`, above the visible canvas.** They must rotate into view, not pop in. The spawner x oscillates (`centerX + amplitude · sin(phase)`) — step `PHASE_STEP_RAD = 0.37`. No center-jitter anymore.
- **Arena wall colliders are `WALL_COLLIDER_THICKNESS = 40 px` thick.** The visual is 12px; the extra depth extends outward from the face, the same trick the old channel walls used to prevent dense-pile penetration. Never unify the two numbers.
- **Asteroid fall is kinematic, not gravity-driven.** Alive chunks have per-body `gravityScale = {x:0, y:0}` and get `setVelocityY(fallSpeedMultiplier)` each tick. Dead chunks flip back to normal gravity so confetti snaps to the death line.
- **Per-body `gravityScale` is a `{x, y}` object, not a scalar.** Phaser doesn't wrap this setter — mutate the raw Matter body directly.

## Asteroids

- **Asteroids are Matter compound bodies — one `Matter.Body.create({ parts })` per live connected component.** No welds. Killing a chunk → `Body.setParts(compound, remaining, false)` + spawn a loose dead chunk inheriting `v + ω × r`.
- **Compound body construction: parts at LOCAL offsets, then `setPosition` after `Body.create`.** Passing pre-positioned parts AND a `position` to `Body.create` produces a corrupt compound that silently defeats broadphase — zero collision pairs, no visible error. Applies to initial spawn and to `fromPartsOfParent` (the split path).
- **Compound collision events report the specific child part, never the parent.** `pair.bodyA.plugin` carries `{ kind, asteroid, chunkId }`. The auto-synthesized parent (emitted when `parts.length ≥ 2`) has an empty plugin — routing on it gets you nothing.
- **Asteroids rotate on spawn.** `Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.01)` in `compoundAsteroid.ts`. Visible tumble is a gameplay-feel invariant — a perfectly axis-aligned asteroid is a regression.
- **Chunks are squares, never triangles.** Triangles were removed in Phase 6. The shape generator produces squares only.
- **The centroid chunk is tagged `isCore`.** Core chunks are vaults: 10× HP (`vaultHpMultiplier` in `CompoundAsteroid` constructor) and the sole Shard source in the prestige loop. Don't overload the flag for other purposes.
- **Material is per-chunk, not per-asteroid.** HP and reward both scale with tier (linked). 9-tier ladder: Dirt → Stone → Copper → Silver → Gold → Ruby → Emerald → Sapphire → Diamond.
- **Material distribution is two-bucket.** Non-core chunks coin-flip against `fillerFraction` (default 0.8, floored at 0.5 by the `refinement` prestige upgrade) — if under, it's t1 Dirt; otherwise draw from a truncated-normal Gaussian over t2–t9 with mean/sigma shifted by Asteroid Quality (`tieredMean`, `tieredSigma` in `materials.ts`). **The core chunk ALWAYS skips the filler roll** and draws from the tiered bucket, guaranteeing Shards on vault kill. Never alter the core bypass — it's load-bearing for prestige pacing.

## Weapons

- **Weapons are plug-ins.** Each weapon implements `WeaponBehavior` in `src/game/weapons/` and is registered in `weaponCatalog.ts`. GameScene is weapon-agnostic — a new weapon is one behavior file + one catalog entry. Never scatter weapon-specific logic into GameScene.
- **Saw blades are static Matter bodies (not sensors).** They both block chunks physically AND deal damage on `collisionstart`/`collisionactive`. The arbor (saw hub) is also static and blocks chunks but does NOT damage — `kind: 'arbor'` is unhandled in the collision router by design.
- **Matter doesn't generate pairs between two static bodies.** Blade and arbor overlap geometrically but never collide. Don't try to "fix" this.
- **Saw is intentionally slow.** Canonical Unity-era lesson: grinding should feel weighty, chunks visibly pile up on weapons. Never speed the saw up as a "fix" for pile-up — that's the intended feel.
- **Saw direction is per-instance, not global.** Each `SawBehavior` owns its own `_clockwise` flag (default true). Read it directly inside the behavior — there is no `gameplayState.sawClockwise`. Persisted per-instance via `SavedWeaponInstance.clockwise` (optional; absent = CW). Toggled by double-clicking the arbor.
- **`input.dragDistanceThreshold = 6`** (set in `wireDrag`). The Phaser default of 0 turns any sub-pixel mouse jitter on a click into a `dragstart`, which routes the release through `dragend` and bypasses the arbor's double-click handler. Don't lower it.

## Grinder

- **Grinder is a singleton `WeaponBehavior`, not a draggable weapon.** Always exactly one instance, spawned unconditionally in `GameScene.spawnGrinder()`. Not draggable, not buy/sell-able, excluded from save-state `weaponInstances` serialization. The player cannot have more or fewer than one grinder.
- **Grinder blades are a row of counter-rotating rectangles tiled across channel width.** Blade count `n = ceil(channelWidth / BLADE_WIDTH_BASE)` and widens with the Channel Width upgrade. Alternating direction per blade index is load-bearing for the "chewing" feel — don't unify direction.
- **Grinder blades are static Matter bodies with `plugin.kind = 'grinder'`.** Created via `matter.add.rectangle` (not `matter.add.image`), so they have NO `gameObject`. `handleContact` falls back to `body.plugin.{kind,instanceId}` when `gameObject` is absent. Don't assume a blade has a gameObject.
- **Grinder kills pay flat $1; other weapon kills pay tier-scaled reward.** Attribution uses last-hit via a `killerType` tag stored on the dead chunk (`chunk.setData('killerType', ...)`), read at collection time in `collectDeadAtDeathLine`. Adding a new weapon requires passing its type into `damageLiveChunk(..., killerType)` and into the `ChunkTarget.damage(amount, killer)` callback.
- **Dead chunks carry `CAT_DEAD_CHUNK` collision category and pass through grinder blades.** Live chunks use the default category and collide. The filter is applied inside `spawnDeadConfettiChunk` — missing it would lock corpses on top of blades. Never omit the filter at the death transition.
- **Grinder width always equals channel width.** Blade Size scales individual blade dimensions; Channel Width triggers retile. There is NO separate grinder-width constant — don't introduce one.

## Collision routing

- **Collision handler filters by `body.plugin.kind`.** Kinds: `'liveChunk'`, `'blade'`, `'arbor'`, and arena walls (raw bodies with no `gameObject` — must be handled as `undefined`).
- **`body.gameObject` is only populated for bodies created through Phaser's matter wrappers.** Raw `this.matter.add.rectangle({ isStatic: true })` arena walls have no `gameObject` reference — collision handlers must tolerate `undefined`.

## State, save, and HUD

- **Save key is `asteroid-grinder:save:v3`**, versioned schema. **No migration code.** Any stale `v1`/`v2` key present at boot is wiped and `UIScene` shows a one-time "Save reset — game updated" toast. This stance applies to any future schema bumps until the game has real users. Autosave fires every 5s plus a `beforeunload` handler plus on any `prestigeState.shopLevelChanged` or `shardsChanged`. `saveState.deserialize` rejects non-finite/non-numeric levels, negative weapon counts, bad prestige fields, and malformed weapon installations. The v3 payload persists `arenaSeed`, `arenaSlotsUnlocked[]`, `arenaFreeUnlockUsed`, and `weaponInstallations[]` (slotId + typeId + instanceId) — reload regenerates the arena from the seed and re-installs weapons at their saved slots.
- **Cash-rate EMA has `tau = 60s`**, persisted as `emaCashPerSec`. Offline elapsed is capped at the prestige-extended cap (8h / 12h / 24h / 48h based on `offline.cap` shop level), floored to integer, min 60s threshold.
- **Silent cash transactions (Collect, sell refund, starting-cash bonus) pass `silent: true`** so they don't pollute the EMA rate.
- **Cross-scene handoff uses `game.registry` keys** as a consume-once mailbox: `pendingSnapshot`, `offlineAward`, `offlineElapsedMs`. Parallel scenes can't receive events fired during a sibling's `create()`, so don't rely on event propagation across scene boundaries at boot.
- **Devtools handles exposed unconditionally in `main.ts`:** `window.__GAME__` (Phaser.Game), `window.__STATE__` (gameplayState), `window.__PRESTIGE__` (prestigeState). Tests and browser probes rely on these being present.
- **Backtick (`` ` ``) toggles the debug HUD.** ESC opens the options modal. `?debug=1` additionally enables Matter wireframes at boot.

## Prestige

- **Prestige state is a separate singleton (`prestigeState.ts`), lifetime spans across runs.** `gameplayState` is per-run; `prestigeState` is persistent. Never conflate the two. `resetData()` on gameplayState wipes cash / upgrades / weapon counts / `instancesBoughtThisRun` / `runSeed`, but does NOT touch `prestigeState`.
- **Shards bank only on prestige confirm.** `pendingShardsThisRun` is a per-run field on GameScene, serialized in the v2 save. Dying or restarting a run without prestiging loses pending shards — intentional. `confirmPrestige()` is the ONLY place `prestigeState.addShards` fires from the core-kill path.
- **`confirmPrestige` must stop the spawn timer, destroy weapons + asteroids + dead chunks, and reset gameplayState BEFORE the prestige shop is shown.** Otherwise new asteroids accumulate beneath the overlay and their Matter bodies leak on the next `scene.restart()`.
- **Weapon `destroy()` removes Matter bodies from the world.** The prestige-confirm cleanup path relies on this — a behavior that only destroys sprites would leak blade bodies across runs.
- **`runSeed` is an opaque string.** `AsteroidSpawner` consumes it via `seedFromString` (FNV-1a) to derive a numeric root seed; each spawn XORs in a counter-advanced sub-seed so the asteroid sequence is deterministic for a given `runSeed`. Empty `runSeed` → random per-spawn (non-deterministic), used for save-less boots and post-reset windows before Start Run.
- **Prestige shop effects stack on top of in-run upgrades.** `applyPrestigeEffects(applyUpgrades(levels), prestigeState.shopLevels())` is the canonical order — prestige overlays and multiplies onto the already-upgraded params. Never invert this order.

## What the Playwright smoke asserts

A subset the tripwire can mechanically check:
- Game boots and `window.__GAME__` is a Phaser.Game after load.
- After 10 seconds of wall-clock play: at least one asteroid has spawned and has non-zero rotation velocity.
- Saw blade hit count is non-zero (grinding is happening).
- Zero `console.error` / `console.warn` entries (Phaser banner is `console.log`, not `error`).
