# Phase 6 — Asteroid Overhaul (Materials, Quality, Fall Speed)

**Status:** design approved, ready for plan
**Date:** 2026-04-16
**Branch target:** `feature/phase-6-asteroid-overhaul`

## 1. Overview & scope

Replace the current flat pastel "random-color rock" system with a **9-tier material ladder** (Dirt → Diamond) that drives HP, reward, and visual identity. Every chunk independently rolls a material from a tier-probability distribution controlled by a new **Asteroid Quality** upgrade. Remove triangles entirely — squares-only chunks. Rendering shifts to procedural per-material textures (gradients, borders, metal highlights, gem glow halos). Centroid cell is tagged as the future core slot but has no new mechanic in Phase 6.

Also in this phase: reduce asteroid "squishiness" (stiffer welds, slower impacts) and add a **Fall Speed** upgrade. Asteroids drift down slowly at base and accelerate as the player levels the upgrade.

### In scope

- 9 material types (Dirt, Stone, Copper, Silver, Gold, Ruby, Emerald, Sapphire, Diamond) with tier-driven HP + reward.
- Per-material procedural texture set (9 textures, cached once at scene boot).
- `Asteroid Quality` upgrade — shifts per-chunk tier-roll distribution upward with each level.
- `Fall Speed` upgrade — scales live-chunk gravity multiplier.
- Triangle removal from shape system.
- Centroid-cell reservation (`isCore` flag, no gameplay effect yet).
- Squishiness reduction: higher Matter `constraintIterations`, weld damping, slower base fall.

### Out of scope (deferred)

- Damage-type system (Physical / Energy / Explosive) from Unity port — dropped. No armor/shield mechanics.
- Disconnected-component split on fracture (Unity `Pinata.FindConnectedGroups`) — backlog.
- Particle sparkle for gems — glow halos only in MVP.
- Prestige cores + meta-progression — backlog.
- Economy rebalance — placeholder `$1` base costs stay.

## 2. Material ladder

9 materials. Each material has tier `T` where **T = HP = base reward**. Global `Chunk HP` upgrade multiplies HP across the ladder; reward stays pinned to raw `T` (upgrading HP makes the grind harder without inflating payout).

Visually grouped into 3 bands:

- **Earth** (matte fill + border, no highlight)
- **Metal** (3-stop gradient + 1-px inset highlight)
- **Gem** (3-stop gradient + inset highlight + baked-in glow halo)

| T | Material | HP | Reward | Band | Fill gradient (135°) | Border | Extra |
|---|----------|----|-------|------|---------------------|--------|-------|
| 1 | Dirt     | 1  | $1    | Earth | `#6b4a2f → #4a3320` | `#2a1a0d` | matte |
| 2 | Stone    | 2  | $2    | Earth | `#9a9a9a → #6a6a6a` | `#2a2a2a` | matte |
| 3 | Copper   | 3  | $3    | Metal | `#ffb88a → #c86a38 → #8a3a18` | `#4a2010` | inset highlight |
| 4 | Silver   | 4  | $4    | Metal | `#ffffff → #b8b8c0 → #6a6a78` | `#3a3a46` | inset highlight |
| 5 | Gold     | 5  | $5    | Metal | `#fff4a0 → #ffc53a → #a8781a` | `#5a3a0a` | inset highlight |
| 6 | Ruby     | 6  | $6    | Gem   | `#ffaab8 → #ff2a4a → #7a0010` | `#4a0010` | inset + red glow |
| 7 | Emerald  | 7  | $7    | Gem   | `#a8ffc8 → #18c86a → #064a1a` | `#004020` | inset + green glow |
| 8 | Sapphire | 8  | $8    | Gem   | `#a8c8ff → #2a5aff → #061a6a` | `#00104a` | inset + blue glow |
| 9 | Diamond  | 9  | $9    | Gem   | `#ffffff → #d0e8ff → #7aa8d0` | `#4a7090` | bright inset + white glow |

### Rendering rules

- Chunks render at **12×12 px** (unchanged from current).
- Earth + Metal textures are 12×12. Gem textures are **18×18** with 3 px glow padding on all sides (the extra size covers the radial-gradient alpha bloom baked into the texture).
- Dead-chunk treatment (unchanged): scale to 0.8×, brightness ~0.55.
- Old pastel `palette.ts` goes unused. File stays in place — may be repurposed later for UI accents or background stars.

## 3. Generator & shape changes

### Triangle removal

`ChunkShape` type deletes entirely (no shape concept remains with a single shape). Removed artifacts:

- `TRIANGLE_COMPLEMENT` map
- `PAIR_PROBABILITY` constant
- `pickShapeForCell`
- triangle branches inside `edgesConnect` / `shapeHasEdgeFacing`
- `triProb` parameter in the generator + spawner

Asteroid silhouettes remain roughly round via the existing centroid-weighted growth — edges become axis-aligned steps, which is the desired "asteroid-ish" look.

### Centroid core reservation

Every asteroid tags its centroid chunk (the (0,0) seed cell) with `isCore: true` (new boolean field on `Chunk`). In Phase 6 this flag has **no gameplay or visual effect** — the core chunk rolls a material like any other. Purpose: let the future prestige/core mechanic latch onto existing data without restructuring the generator.

### Per-chunk material roll

After the generator produces the list of cells, the spawner rolls each chunk's material independently by calling `chooseMaterial(qualityLevel, rng)`. Asteroids end up **mottled** — a mix of tiers rather than uniform.

### Adjacency & welds

`chunkId`-keyed adjacency (Phase 4 refactor) remains. No data-structure change. Edge-adjacency checks simplify to square-to-square only.

## 4. Upgrades & physics tuning

### Asteroid Quality (new upgrade)

- **Category:** Asteroids
- **Max level:** 9
- **Base cost:** `$1` placeholder (existing `costAtLevel` exponential)
- **Effect:** controls which material tiers appear in the per-chunk roll.
- **Unlock rule:** `maxTier(Q) = min(1 + Q, 9)`. L0 → only Dirt. L1 → Dirt + Stone. … L8 → full ladder.
- **Weighting within unlocked tiers:** `weight(t) = 0.7^(t−1)` if `t ≤ maxTier(Q)`, else 0. Normalize to a probability distribution per roll.

Example distributions:

| Q | Distribution (T1 → T9) |
|---|------------------------|
| 0 | 100 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 1 | 59 / 41 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 2 | 46 / 32 / 22 / 0 / 0 / 0 / 0 / 0 / 0 |
| 5 | 36 / 25 / 18 / 12 / 9 / 0 / 0 / 0 / 0 |
| 8 | 31 / 22 / 15 / 11 / 7 / 5 / 4 / 3 / 2 |

At L8, a 40-chunk asteroid has a good chance of carrying one Diamond chunk (~2% per roll). The decay base `0.7` is tunable in `materials.ts` if gems feel too rare / too common during live verification.

### Fall Speed (new upgrade)

- **Category:** Asteroids
- **Max level:** 9
- **Base cost:** `$1` placeholder
- **Effect:** scales Matter per-body `gravityScale` on **live** asteroid chunks. Dead chunks keep the default (1.0) so confetti stays snappy.
- **Multiplier curve:** L0 = 0.15×, L1 = 0.25×, … L9 = 1.05×. Per-level step `+0.10`.
- **Apply path:** set `body.gravityScale = fallSpeedMultiplier` on chunk spawn and on detach-to-dead (reset to 1). Subscribe to `upgradeLevelChanged` for live refresh across existing asteroids.

### Existing upgrades — unchanged behavior

- **Chunk HP** still multiplies base HP (now across the tier ladder — so L3 Copper with 2× HP = 6 HP).
- **Drop Rate, Asteroid Size, Channel Width** unchanged.

### Squishiness fixes (one-time changes, not upgrades)

- Matter world config: `constraintIterations: 8` (up from 4).
- Weld constraints gain `damping: 0.1` (from 0). Zero-length + stiffness 1 remain.
- Combined with the slow base fall speed, welds should look rigid under saw pressure and pile load.

## 5. Integration points (files touched)

### New files

- **`src/game/materials.ts`** — canonical ladder. Exports:
  - `MATERIALS: Material[]` (9 entries; `tier`, `name`, `colorGradient`, `borderColor`, `band`, `hasGlow`, `glowColor`).
  - `chooseMaterial(qualityLevel: number, rng: SeededRng): Material` — implements the exponential-decay weighted pick.
  - `createMaterialTexture(scene: Phaser.Scene, material: Material): string` — draws into a `Phaser.Textures.CanvasTexture` (12×12 Earth/Metal, 18×18 Gem with 3 px glow padding). Returns the texture key.
  - `fallSpeedMultiplier(level: number): number` — `0.15 + 0.10 * level`.

### Modified files

- **`src/game/shape.ts`** — delete the `ChunkShape` type entirely. With only one shape, the concept carries no information. Chunk references to `shape` are removed at the call sites.
- **`src/game/circularShapeGenerator.ts`** — remove `triProb`, `pickShapeForCell`, `PAIR_PROBABILITY`, `TRIANGLE_COMPLEMENT`, and triangle branches in `edgesConnect` / `shapeHasEdgeFacing`. Signature becomes `generate(rng, chunkCount) → ChunkCell[]`.
- **`src/game/asteroid.ts`** — `Chunk` gains `material: Material` and `isCore: boolean`. `maxHp` derives from `material.tier * hpMultiplier`. Sprite key becomes `chunk-${material.name}`. Reward on death looks up `material.tier`. Dead-chunk visual unchanged.
- **`src/game/asteroidSpawner.ts`** — drop `triProb`. Accept `qualityLevel` + `rng`. Call `chooseMaterial` per chunk. Tag centroid chunk `isCore: true`.
- **`src/game/upgradeCatalog.ts`** — add `asteroidQuality` and `asteroidFallSpeed` upgrade defs (category Asteroids, max 9, placeholder base cost).
- **`src/game/upgradeApplier.ts`** — `EffectiveGameplayParams` gains `qualityLevel` and `fallSpeedMultiplier`. Applier reads the two new upgrade levels.
- **`src/game/gameplayState.ts`** — no structural change. Existing `upgradeLevelChanged` event covers the new ones.
- **`src/game/palette.ts`** — unused by spawner; file retained for future reuse.
- **`src/scenes/GameScene.ts`** —
  - In `create()`: call `createMaterialTexture` for all 9 materials once.
  - Matter config on scene boot: `constraintIterations: 8`.
  - Weld constraint creation: add `damping: 0.1`.
  - On chunk spawn: set `body.gravityScale = fallSpeedMultiplier` for live chunks. On chunk death: reset `gravityScale = 1`.
  - Subscribe to `upgradeLevelChanged` for `asteroidFallSpeed`: iterate live chunks and refresh `gravityScale`.
- **`src/scenes/UIScene.ts`** — no change. Catalog-driven button rendering picks up the two new upgrades automatically.

### What does NOT change

- Weapon behaviors (Saw / Laser / Missile / Blackhole). Damage path is material-agnostic; they call `damageChunkByImage` with a scalar damage value as before.
- Fracture on chunk death — already severs welds per-chunk; no changes for material system.
- Unity-style variant mechanics (Armored / Shielded / Swift / Heavy) — **not implemented**. No damage-type system, no shield halo, no per-variant mass or gravity overrides.

## 6. Testing & rollout

### Build sequence

One commit per step on `feature/phase-6-asteroid-overhaul`:

1. `materials.ts` + its tests (pure module, no wiring).
2. Generator + shape simplification (triangle removal, tests).
3. Asteroid + spawner rewire (material field, `isCore`, tier-driven HP + reward).
4. Upgrade catalog + applier (two new upgrades, `EffectiveGameplayParams` plumbing).
5. GameScene wiring (textures on boot, `gravityScale`, weld damping, constraint-iterations bump).
6. Manual Chrome verification (checklist below).
7. Code review phase (required per global conventions) — fresh reviewer agent.
8. Final verification + FF merge to `main`.

### Vitest — additions / updates

- `materials.test.ts` (**new**): distribution sums to 1, `maxTier(Q) = min(1 + Q, 9)`, locked tiers have weight 0, top tier at L8 appears with the expected ~2% probability over many seeded rolls.
- `circularShapeGenerator.test.ts` (**updated**): triangle-related cases removed; square-only generation still produces connected shapes for chunk counts 3–30.
- `upgradeApplier.test.ts` (**updated**): `qualityLevel` and `fallSpeedMultiplier` flow through correctly; existing upgrades unaffected.
- `asteroid.test.ts` / `asteroidSpawner.test.ts` (**updated**): centroid chunk has `isCore = true`; per-chunk `maxHp = material.tier * hpMultiplier`; reward on death uses `material.tier`.

Target: existing 57 tests stay green, add ~10 new ones, net ≥ 65 green.

### Live-verification checklist (Chrome via DevTools MCP)

- Arena populates with Dirt-only asteroids at Quality L0.
- Buying Asteroid Quality once → Stone starts appearing (~40% of chunks).
- Ramp Quality to L4 → Copper/Silver/Gold appear at roughly documented frequencies.
- Ramp to L8 → eventually a gem appears with a visible glow halo.
- Cash ticks up by `tier` when a chunk dies (verify via HUD).
- Fall Speed L0 → asteroids drift slowly. Increment → drift accelerates.
- Piling asteroids on the saw → welds hold rigid (no visible squish).
- Confetti (dead chunks) moves quickly even with Fall Speed at L0.
- Chunk textures sharp at 12px (no DPR blur).
- Console clean — no Matter warnings, no missing-texture errors.

### Ship gates before FF-merge

- All vitest green.
- `npm run build` clean.
- `npm run typecheck` clean.
- Live playthrough in Chrome as above.
- `ROADMAP.md` Phase 6 marked **done (YYYY-MM-DD)**.
- `README.md` feature list mentions the material ladder and two new upgrades.
- `CLAUDE.md` updated if new Phaser/Matter gotchas surface (per-body `gravityScale`, baked glow textures).
- Code review pass complete, findings addressed.
