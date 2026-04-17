# Prestige System — Design

**Status:** Awaiting user review
**Date:** 2026-04-16
**Branch target:** `feature/prestige-system`
**ROADMAP anchor:** §3 "Prestige / meta loop — asteroid cores"

## Problem

Every asteroid already tags a `isCore` centroid chunk (Phase 6 reserved this flag with no gameplay effect, documented in `DESIGN_INVARIANTS.md` § Core chunk). There is currently no reason for a player to play past the first few runs: the cost curve is placeholder, there is no meta-loop, and cores are indistinguishable from other chunks. The roadmap calls for prestige: a hard-reset loop where killing core chunks yields a persistent currency spent on upgrades that carry across runs.

A secondary problem: the current material-distribution model is uniform-random across the 9 tiers given a `qualityLevel`. Asteroids at high `qualityLevel` stop "looking like asteroids" because Dirt is no longer dominant. Prestige needs a distribution model that keeps asteroids visually readable at every level while still rewarding progression.

## Design goals

1. **Two-phase loop.** Run → accumulate 🔮 Shards → Prestige button wipes run → spend Shards in a persistent shop → Run Config → new run.
2. **Vault cores.** The `isCore` chunk becomes a visibly-distinct high-HP target. Killing it drops Shards equal to the core's material tier.
3. **Two-bucket materials.** Every asteroid is a mix of fixed "filler" (t1 Dirt, reads as rock) and "tiered" chunks (t2–t9, distributed by a Gaussian that shifts right as the in-run Asteroid Quality upgrade levels). Filler % is constant within a run; a prestige upgrade (Refinement) lowers the baseline filler fraction.
4. **Persistent tree with seven categories.** Free weapon slots, cash multiplier, damage multiplier, upgrade cost discount, Refinement, offline-cap extender, Shard yield, starting cash.
5. **Minimal Run Config screen.** Seed input + re-roll + Start. Future "fun runs" (forced diamond, spawn sliders, etc.) live here later.
6. **No scaling gate on prestige.** Player can click Prestige any time; a confirmation modal guards misclicks.

## Out of scope

- **Arena overhaul** (walls extend to screen edges, random pathways, procedural weapon hardpoints) — separate future roadmap item. Prestige is designed so it doesn't block or duplicate arena work.
- **Fun runs** (force-all-diamond, filler sliders per-run, etc.) — Run Config screen is built minimal; modifiers land later in that same screen.
- **Prestige-tree UX polish** — tooltips, animations, category icons — deferred to the art pass.
- **Balance tuning of exact Shard costs / growth rates** — numbers below are starting points; full economy rebalance has its own roadmap entry (§4).

## §1 — Material distribution rework

### Two-bucket model

Every chunk in a spawned asteroid is assigned to one of two buckets at spawn time:

- **Filler bucket** (default 80% of non-core chunks): always `t1 Dirt`. Rolled independently per chunk by coin-flip against `fillerFraction`.
- **Tiered bucket** (default 20% of non-core chunks): material drawn from a truncated-normal distribution over `[t2, t9]` with parameters that depend on the in-run Asteroid Quality upgrade level `L`.

The `isCore` (vault) chunk **bypasses the filler roll** — cores are always drawn from the tiered bucket, guaranteeing Shards on a vault kill.

### Sampling parameters

```
μ(L) = clamp(2 + L * 0.6, 2, 9)     // mean of tiered distribution
σ(L) = clamp(0.6 + L * 0.08, 0.5, 1.5) // widens with level
```

Draw a normal sample `x ~ N(μ, σ)`, round to nearest integer, clamp into `[2, 9]`. Map integer to tier. This gives:

| Level | μ | σ | Dominant tiers |
|---|---|---|---|
| L0 | 2.0 | 0.6 | ~95% t2, tiny t3 tail |
| L5 | 5.0 | 1.0 | t4–t6 with t3/t7 shoulders |
| L10 | 8.0 | 1.4 | t7–t9 with t6 shoulder, negligible t5 |

All numbers tunable.

### Prestige-driven filler reduction

Prestige upgrade **Refinement** reduces `fillerFraction` by 5% per level, floor 50%:

```
fillerFraction = max(0.50, 0.80 - 0.05 * refinementLevel)
```

6 levels max → floor at 50% filler. At floor, half the asteroid is still Dirt (visual identity preserved) while half is "real" tiered material (payout roughly 2.5× vs. baseline at the same Asteroid Quality).

### Files touched

| File | Change |
|---|---|
| `src/game/materials.ts` | Add `sampleTieredMaterial(qualityLevel, rng)` — pure, truncated-normal over t2–t9. Keep existing t1 constant. |
| `src/game/asteroidSpawner.ts` | Replace current per-chunk material roll with: `isCore` → tiered; else coin-flip filler vs tiered. Accept `fillerFraction` parameter. Drop old `chooseMaterial(qualityLevel)` signature (or keep as a thin wrapper for back-compat during migration). |
| `src/game/materials.test.ts` | New tests: mean shifts with level, no t1 in tiered bucket, clamps to [t2, t9], core bypasses filler. |
| `src/game/asteroidSpawner.test.ts` | Update distribution expectations; add test that filler fraction is respected (approximate, within ±2% over a large sample). |

## §2 — Vault core chunks

### Behavior change

The `isCore` chunk becomes a "vault" — significantly tougher than a same-tier normal chunk, distinct visually, and the sole Shard source.

- **HP multiplier:** `vaultHpMultiplier = 10`. A tier-9 core with base tier HP 18 becomes 180 HP. (Number tunable; starting point.)
- **Visual:** additive outer glow in the core's tier color, 1.5× scale of the glow halo used by gem-tier chunks. Use the same baked-canvas trick already used for chunks (`materials.ts` baking). A new texture key `core-${material.name}` layered atop the base chunk texture.
- **Shard yield on death:** `shardsDropped = coreMaterial.tier + shardYieldBonus` where `shardYieldBonus` is the prestige upgrade level (0–5). So a t9 Diamond core at max yield drops 14 Shards.
- **Kill attribution:** the existing `killerType` plumbing (added in the grinder overhaul) identifies which weapon killed the core. Any weapon kill awards Shards; grinder kills also award Shards (cores aren't free — grinder just deals trickling damage).

### Files touched

| File | Change |
|---|---|
| `src/game/compoundAsteroid.ts` | When building a part with `isCore: true`, multiply `maxHp` by `vaultHpMultiplier`. Attach core-glow texture. |
| `src/scenes/GameScene.ts` | `damageLiveChunk` / death path: if chunk `isCore`, emit `prestigeState.addShards(coreMaterial.tier + shardYieldBonus)` rather than cash-only. Keep cash reward intact (t9 Diamond chunk's normal cash payout still fires). |
| `src/game/prestigeState.ts` (new) | Holds `shards`, `prestigeCount`, `shopLevels`. See §3. |
| `tests/*` | Add tests for vault HP multiplier, Shard award on core death, no Shards on non-core death. |

## §3 — Prestige state & shop

### New module: `src/game/prestigeState.ts`

A singleton akin to `gameplayState.ts`, owning the persistent prestige data.

```typescript
interface PrestigeSnapshot {
  shards: number;
  prestigeCount: number;
  shopLevels: Record<string, number>; // shop entry id → level
}

class PrestigeState {
  get shards(): number;
  get prestigeCount(): number;
  shopLevel(id: string): number;
  addShards(amount: number): void;
  trySpend(amount: number): boolean;
  setShopLevel(id: string, level: number): void;
  registerPrestige(): void; // increments prestigeCount
  loadSnapshot(s: PrestigeSnapshot): void;
  resetData(): void; // total wipe (dev / reset-save)

  // events: shardsChanged, shopLevelChanged, prestigeRegistered
}
```

Parallels `gameplayState` but separate because its lifetime is **across** runs, not per-run.

### Shop catalog

Pure data in `src/game/prestigeShopCatalog.ts`. Same shape as `UpgradeDef`, extended with a `family` enum.

| ID | Family | Max Lv | Base 🔮 Cost | Growth | Effect |
|---|---|---|---|---|---|
| `free.saw` | free-weapon | ∞ | 3 | 1.6 | +1 Free Saw (first N buys cost $0 in-run) |
| `free.laser` | free-weapon | ∞ | 3 | 1.6 | +1 Free Laser |
| `free.missile` | free-weapon | ∞ | 3 | 1.6 | +1 Free Missile |
| `free.blackhole` | free-weapon | ∞ | 3 | 1.6 | +1 Free Blackhole |
| `mult.cash` | multiplier | ∞ | 5 | 1.4 | +10% global cash per level |
| `mult.damage` | multiplier | ∞ | 6 | 1.4 | +5% all weapon damage per level |
| `discount.upgrade` | multiplier | 10 | 8 | 1.5 | −5% in-run upgrade cost per level, capped −50% |
| `refinement` | material | 6 | 20 | 2.0 | Filler −5% per level, floor 50% |
| `offline.cap` | economy | 3 | 25 | 3.0 | 8h → 12h → 24h → 48h offline-earning cap |
| `shard.yield` | economy | 5 | 30 | 2.0 | +1 Shard per vault core per level |
| `start.cash` | economy | ∞ | 5 | 1.5 | +$50 starting cash per level |

All Shard costs / growth rates are placeholders; they live in one file so rebalancing is a single-file diff.

### Effects integration

`upgradeApplier.ts` gains a parallel helper `applyPrestigeEffects(params)` that mutates `EffectiveGameplayParams` before in-run upgrades are applied. Effects:

- `cashMultiplier = 1 + 0.10 * level('mult.cash')`
- `damageMultiplier = 1 + 0.05 * level('mult.damage')`
- `upgradeCostMultiplier = max(0.50, 1 - 0.05 * level('discount.upgrade'))`
- `fillerFraction = max(0.50, 0.80 - 0.05 * level('refinement'))`
- `offlineCapMs = [8h, 12h, 24h, 48h][level('offline.cap')]`
- `shardYieldBonus = level('shard.yield')`
- `freeSlotCount[weaponId] = level('free.' + weaponId)`
- `startingCash = 50 * level('start.cash')`

### Free-slot price override

`weaponCatalog.buyCost(weaponId, instancesBoughtThisRun)` (new signature) returns `$0` if `instancesBoughtThisRun < freeSlotCount[weaponId]`, else the normal formula. In-run buy counter is a per-run `Map<weaponId, number>` stored on `gameplayState` and reset on `resetData()`.

### Files touched

| File | Change |
|---|---|
| `src/game/prestigeState.ts` (new) | Singleton as above + tests. |
| `src/game/prestigeShopCatalog.ts` (new) | Table of 11 shop entries + tests. |
| `src/game/upgradeApplier.ts` | Add `applyPrestigeEffects(params, prestigeLevels)`; returns new `EffectiveGameplayParams` fields. |
| `src/game/gameplayState.ts` | Add per-run `_instancesBoughtThisRun: Map<string, number>`. Increment on `buyWeapon`. Reset on `resetData()`. |
| `src/game/weaponCatalog.ts` | `buyCost(weaponId, purchasedThisRun, freeSlots)` helper. |

## §4 — Prestige flow & UI

### Flow diagram

```
┌──────────────┐  [🔮 Prestige]  ┌──────────────┐  [Next]  ┌──────────────┐  [Start]  ┌─────────┐
│ Main run     │ ──────────────▶ │ Prestige     │ ──────▶  │ Run Config   │ ───────▶  │ New run │
│ (GameScene + │                  │ Shop         │          │ (seed input) │            │         │
│  UIScene)    │                  │              │          │              │            │         │
└──────────────┘                  └──────────────┘          └──────────────┘            └─────────┘
       ▲                                                                                     │
       └─────────────────────────────────────────────────────────────────────────────────────┘
```

### Bottom bar (main run)

Added to `UIScene` bottom of viewport:

```
$4,820 | 🔮 12 this run (banked: 47)  (prestige #2)          [🔮 Prestige →]
```

- 💸 Cash counter (existing, moved into the bar).
- 🔮 **This-run Shards** counter (`pendingShardsThisRun`, live, increments on vault kill).
- Parenthetical **banked** total (`prestigeState.shards`) — the currency the Shop actually spends.
- Prestige count text.
- Prestige button → opens confirmation modal.

**Shard banking rule:** Shards stay in `pendingShardsThisRun` until the player confirms Prestige. On confirm, `prestigeState.addShards(pendingShardsThisRun)` runs, then `gameplayState.resetData()` wipes the run. This frames prestige as "commit your gains by resetting" — if the player dies or restarts the run without prestiging, pending Shards are lost. (Rationale: makes the reset feel like a meaningful trade rather than a free button; matches the modal copy "You will gain: 🔮 12 Shards".)

### Confirmation modal

Modal over GameScene on Prestige-button click:

```
┌──────────────────────────────────────┐
│ Prestige now?                        │
│                                      │
│ Resets: cash, in-run upgrades,       │
│ all placed weapons.                  │
│ Keeps: 🔮 Shards + Prestige Shop.    │
│                                      │
│ You will gain: 🔮 12 Shards          │
│                                      │
│        [Cancel]   [Prestige]         │
└──────────────────────────────────────┘
```

Shards are added to `prestigeState` and `prestigeCount` incremented on confirm.

### Prestige Shop screen

New Phaser scene `PrestigeShopScene` or a UIScene sub-panel (preferred — keeps GameScene paused beneath a full-screen overlay, no new scene lifecycle to wire). Sections:

- **FREE WEAPONS** (four rows)
- **MULTIPLIERS** (three rows: cash, damage, discount; refinement)
- **ECONOMY** (three rows: offline cap, shard yield, starting cash)

Each row: label, level / max, 🔮 cost, Buy button. Buy deducts Shards and increments the level. Persisted immediately.

Footer: "Next → Run Config" button.

### Run Config screen

Minimal. Seed field (text input, default `cosmic-dust-<timestamp>`), 🎲 Re-roll button (generates a new random seed), and a "🚀 Start Run" button. A small carry-over summary line above the buttons reminds the player what's active.

Clicking Start:
1. Stores seed in `gameplayState.runSeed` (new field).
2. Calls `gameplayState.resetData()` — wipes cash, in-run levels, weapon instances, per-saw directions, EMA. Sets `cash = startingCash`.
3. Restarts GameScene. Asteroid spawner uses `runSeed` to seed its RNG.

### What persists, what wipes, on prestige

**Persists (prestigeState):**
- 🔮 Shards balance
- Shop levels (all entries)
- Prestige count
- Offline-cap extender level
- Any future "unlocked run modifier" levels

**Wipes (gameplayState.resetData()):**
- 💸 Cash → `startingCash` (0 + prestige bonus)
- In-run upgrade levels → 0
- Weapon instances (destroyed from the Matter world)
- Weapon counts → `startCount` (1 grinder, 0 of everything else)
- Per-saw directions → default CW
- EMA cash/sec → 0
- In-flight asteroids → cleared
- `instancesBoughtThisRun` → empty
- `runSeed` → set from Run Config

### Files touched

| File | Change |
|---|---|
| `src/scenes/UIScene.ts` | Add bottom bar with Shards + Prestige button. Add Prestige Shop sub-panel. Add Run Config sub-panel. |
| `src/scenes/GameScene.ts` | On prestige confirm: `prestigeState.addShards(pendingShardsThisRun)`, `prestigeState.registerPrestige()`, `gameplayState.resetData()`, scene restart. |
| `src/main.ts` | No change — UI handled as sub-panels, no new scene. |

## §5 — Save state migration

### Versioning

Bump `SAVE_STATE_VERSION` from `1` to `2`. New fields on `SaveStateV2`:

```typescript
interface SaveStateV2 {
  v: 2;
  // unchanged from v1:
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstances: SavedWeaponInstance[];
  emaCashPerSec: number;
  savedAt: number;
  // new:
  runSeed: string;
  pendingShardsThisRun: number;       // earned but not yet "prestiged in"
  prestigeShards: number;              // total banked Shards
  prestigeCount: number;
  prestigeShopLevels: Record<string, number>;
  instancesBoughtThisRun: Record<string, number>;
}
```

### Migration path

On load:
1. If `v === 1`: upgrade in memory — add default prestige fields (`prestigeShards: 0`, `prestigeCount: 0`, `prestigeShopLevels: {}`, `pendingShardsThisRun: 0`, `instancesBoughtThisRun: {}`, `runSeed: randomSeed()`). Write back as `v: 2`.
2. If `v === 2`: load as-is.
3. If `v > 2` or invalid: ignore save, start fresh. (Existing behavior.)

### Files touched

| File | Change |
|---|---|
| `src/game/saveState.ts` | Add `SaveStateV2`, bump constant, add migration branch. New storage key `asteroid-grinder:save:v2`. Keep `v1` loader for migration. Tests for migration. |

## §6 — Implementation order

1. **Material distribution rework** (§1). Pure logic; no UI. Ship as standalone commit so mid-work asteroids don't break.
2. **Vault cores** (§2). HP + glow + Shard award plumbing. Requires `prestigeState` from §3 so the Shard event has a destination.
3. **Prestige state + shop catalog** (§3, data layer only). Numbers plumbed into `EffectiveGameplayParams`. No UI yet.
4. **Free-slot price override** (§3, integrates with existing weapon buy). Small.
5. **Bottom bar + Prestige button + confirmation modal** (§4, first UI). Visible loop — player can now earn Shards and reset.
6. **Prestige Shop sub-panel** (§4). Buy buttons wired.
7. **Run Config sub-panel** (§4). Seed input, re-roll, Start.
8. **Save state migration** (§5). Folded into each phase as the fields land.
9. **Vitest sweep + Playwright smoke update** — smoke should boot the game, kill a vault core, prestige, and confirm Shards carried over.

## §7 — Success criteria

- Players can see 🔮 Shards counter during a run and watch it increment on vault-core kills.
- Prestige button + modal works; after confirming, the run is wiped and the Shop is shown.
- All seven shop families are purchasable; levels persist via localStorage across browser reloads.
- Material distribution matches the two-bucket model: at Asteroid Quality L0, ~80% of chunks are t1 Dirt, ~20% are t2; at L10 with Refinement maxed, 50% t1 + 50% distributed across t6–t9.
- Free-weapon slots zero the in-run buy cost for the first N purchases of a type.
- Save state v1 games transparently upgrade to v2 with empty prestige state.
- Playwright smoke extended to cover the prestige loop.
- All vitest tests (currently 128) plus new ones pass.
