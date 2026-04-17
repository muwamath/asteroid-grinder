# Prestige System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the §3 prestige meta-loop from ROADMAP.md — run → kill vault cores → bank 🔮 Shards on Prestige → spend in a persistent 11-entry shop → Run Config → new run. Source spec: `docs/superpowers/specs/2026-04-16-prestige-system-design.md`.

**Architecture:** Two parallel state singletons: in-run `gameplayState` (existing) and persistent `prestigeState` (new). Material distribution split into filler (t1 Dirt) and tiered (Gaussian over t2–t9) buckets. `isCore` chunks become vaults (10× HP, glowy, Shard drop). Eleven-entry persistent shop flows into `EffectiveGameplayParams` via a parallel `applyPrestigeEffects` helper before in-run upgrades apply. UI via three new UIScene sub-panels (bottom bar, shop, run config). Save state bumps v1 → v2 with transparent migration.

**Tech Stack:** Phaser 3, Matter.js, TypeScript, Vite, Vitest, Playwright.

**Branch:** `feature/prestige-system` (already exists; spec is committed at `8dd7b34`).

---

## File structure overview

**New files:**
- `src/game/prestigeState.ts` — persistent singleton with shards, shopLevels, prestigeCount, events
- `src/game/prestigeState.test.ts`
- `src/game/prestigeShopCatalog.ts` — 11 shop entries with family enum
- `src/game/prestigeShopCatalog.test.ts`
- `src/game/prestigeEffects.ts` — `applyPrestigeEffects` that extends `EffectiveGameplayParams`
- `src/game/prestigeEffects.test.ts`

**Modified files:**
- `src/game/materials.ts` — add `sampleTieredMaterial(qualityLevel, rng)` pure helper
- `src/game/materials.test.ts`
- `src/game/asteroidSpawner.ts` — accept `fillerFraction`; route cores/tiered/filler
- `src/game/compoundAsteroid.ts` — vault HP multiplier + core glow texture
- `src/game/upgradeApplier.ts` — extend `EffectiveGameplayParams` with prestige-driven fields
- `src/game/gameplayState.ts` — `_instancesBoughtThisRun`, `runSeed`, `startingCash`
- `src/game/weaponCatalog.ts` — `buyCost(weaponId, purchasedThisRun, freeSlots, baseCost)` helper
- `src/game/saveState.ts` — `SaveStateV2`, bump key, migration from v1
- `src/game/saveState.test.ts`
- `src/scenes/GameScene.ts` — Shard award on core kill; consume `runSeed` for spawner; reset path
- `src/scenes/UIScene.ts` — bottom bar, Prestige modal, Prestige Shop sub-panel, Run Config sub-panel
- `src/main.ts` — load prestige snapshot alongside gameplay snapshot
- `ROADMAP.md` — mark §3 prestige item done
- `README.md` — mention prestige loop
- `CLAUDE.md` — bump test count
- `DESIGN_INVARIANTS.md` — new section: vault cores, two-bucket distribution, shard banking rule
- `tests/e2e/smoke.spec.ts` — extended smoke covering vault kill + prestige reset

---

## Task 1: Prestige state singleton (§3 data layer)

**Files:**
- Create: `src/game/prestigeState.ts`
- Create: `src/game/prestigeState.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/prestigeState.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { prestigeState } from './prestigeState';

beforeEach(() => {
  prestigeState.reset();
});

describe('prestigeState', () => {
  it('starts at zero shards, zero prestiges, empty shop', () => {
    expect(prestigeState.shards).toBe(0);
    expect(prestigeState.prestigeCount).toBe(0);
    expect(prestigeState.shopLevel('mult.cash')).toBe(0);
  });

  it('addShards increments and emits shardsChanged', () => {
    const seen: number[] = [];
    prestigeState.on('shardsChanged', (total, delta) => seen.push(delta));
    prestigeState.addShards(5);
    prestigeState.addShards(3);
    expect(prestigeState.shards).toBe(8);
    expect(seen).toEqual([5, 3]);
  });

  it('trySpend deducts when affordable, rejects otherwise', () => {
    prestigeState.addShards(10);
    expect(prestigeState.trySpend(4)).toBe(true);
    expect(prestigeState.shards).toBe(6);
    expect(prestigeState.trySpend(99)).toBe(false);
    expect(prestigeState.shards).toBe(6);
  });

  it('setShopLevel emits shopLevelChanged', () => {
    const seen: Array<[string, number]> = [];
    prestigeState.on('shopLevelChanged', (id, lv) => seen.push([id, lv]));
    prestigeState.setShopLevel('mult.cash', 3);
    expect(prestigeState.shopLevel('mult.cash')).toBe(3);
    expect(seen).toEqual([['mult.cash', 3]]);
  });

  it('registerPrestige increments count', () => {
    prestigeState.registerPrestige();
    prestigeState.registerPrestige();
    expect(prestigeState.prestigeCount).toBe(2);
  });

  it('loadSnapshot replaces state and emits events', () => {
    prestigeState.loadSnapshot({
      shards: 12,
      prestigeCount: 4,
      shopLevels: { 'mult.cash': 2, 'free.saw': 1 },
    });
    expect(prestigeState.shards).toBe(12);
    expect(prestigeState.prestigeCount).toBe(4);
    expect(prestigeState.shopLevel('mult.cash')).toBe(2);
    expect(prestigeState.shopLevel('free.saw')).toBe(1);
  });

  it('resetData wipes to zero without touching listeners', () => {
    const seen: number[] = [];
    prestigeState.on('shardsChanged', (total) => seen.push(total));
    prestigeState.addShards(5);
    prestigeState.resetData();
    expect(prestigeState.shards).toBe(0);
    prestigeState.addShards(2);
    expect(seen).toEqual([5, 0, 2]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/prestigeState.test.ts`
Expected: FAIL — `prestigeState` import missing.

- [ ] **Step 3: Write the implementation**

Create `src/game/prestigeState.ts`:

```typescript
type Listener<A extends unknown[]> = (...args: A) => void;

interface Events {
  shardsChanged: [total: number, delta: number];
  shopLevelChanged: [id: string, level: number];
  prestigeRegistered: [count: number];
}

export interface PrestigeSnapshot {
  shards: number;
  prestigeCount: number;
  shopLevels: Record<string, number>;
}

class PrestigeState {
  private _shards = 0;
  private _prestigeCount = 0;
  private readonly _shopLevels = new Map<string, number>();
  private readonly listeners: { [K in keyof Events]: Set<Listener<Events[K]>> } = {
    shardsChanged: new Set(),
    shopLevelChanged: new Set(),
    prestigeRegistered: new Set(),
  };

  get shards(): number { return this._shards; }
  get prestigeCount(): number { return this._prestigeCount; }

  shopLevel(id: string): number {
    return this._shopLevels.get(id) ?? 0;
  }

  shopLevels(): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const [k, v] of this._shopLevels) out[k] = v;
    return out;
  }

  addShards(amount: number): void {
    if (amount === 0) return;
    this._shards += amount;
    this.emit('shardsChanged', this._shards, amount);
  }

  trySpend(amount: number): boolean {
    if (this._shards < amount) return false;
    this._shards -= amount;
    this.emit('shardsChanged', this._shards, -amount);
    return true;
  }

  setShopLevel(id: string, level: number): void {
    this._shopLevels.set(id, level);
    this.emit('shopLevelChanged', id, level);
  }

  registerPrestige(): void {
    this._prestigeCount += 1;
    this.emit('prestigeRegistered', this._prestigeCount);
  }

  loadSnapshot(s: PrestigeSnapshot): void {
    this._shards = s.shards;
    this.emit('shardsChanged', this._shards, s.shards);
    this._prestigeCount = s.prestigeCount;
    this.emit('prestigeRegistered', this._prestigeCount);
    this._shopLevels.clear();
    for (const [k, v] of Object.entries(s.shopLevels)) {
      this._shopLevels.set(k, v);
      this.emit('shopLevelChanged', k, v);
    }
  }

  on<E extends keyof Events>(event: E, cb: Listener<Events[E]>): () => void {
    this.listeners[event].add(cb as Listener<Events[keyof Events]>);
    return () => {
      this.listeners[event].delete(cb as Listener<Events[keyof Events]>);
    };
  }

  resetData(): void {
    this._shards = 0;
    this._prestigeCount = 0;
    this._shopLevels.clear();
    this.emit('shardsChanged', 0, 0);
  }

  reset(): void {
    this.resetData();
    this.listeners.shardsChanged.clear();
    this.listeners.shopLevelChanged.clear();
    this.listeners.prestigeRegistered.clear();
  }

  private emit<E extends keyof Events>(event: E, ...args: Events[E]): void {
    for (const cb of this.listeners[event]) {
      (cb as Listener<Events[E]>)(...args);
    }
  }
}

export const prestigeState = new PrestigeState();
export type { PrestigeState };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/prestigeState.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/prestigeState.ts src/game/prestigeState.test.ts
git commit -m "prestige: persistent state singleton (shards, shop levels, prestige count)"
```

---

## Task 2: Material distribution — two-bucket model (§1)

**Files:**
- Modify: `src/game/materials.ts`
- Modify: `src/game/materials.test.ts`
- Modify: `src/game/asteroidSpawner.ts`

- [ ] **Step 1: Write failing tests for `sampleTieredMaterial`**

Append to `src/game/materials.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sampleTieredMaterial, tieredMean, tieredSigma } from './materials';
import { SeededRng } from './rng';

describe('sampleTieredMaterial', () => {
  it('never returns t1 (filler) — output is always in [t2, t9]', () => {
    const rng = new SeededRng(1);
    for (let i = 0; i < 500; i++) {
      const m = sampleTieredMaterial(0, rng);
      expect(m.tier).toBeGreaterThanOrEqual(2);
      expect(m.tier).toBeLessThanOrEqual(9);
    }
  });

  it('mean shifts right as qualityLevel increases', () => {
    expect(tieredMean(0)).toBeLessThan(tieredMean(5));
    expect(tieredMean(5)).toBeLessThan(tieredMean(10));
  });

  it('mean clamps at 9 for very high levels', () => {
    expect(tieredMean(50)).toBe(9);
  });

  it('sigma grows with level but caps at 1.5', () => {
    expect(tieredSigma(0)).toBeLessThan(tieredSigma(5));
    expect(tieredSigma(50)).toBeLessThanOrEqual(1.5);
  });

  it('L0 samples are concentrated at t2 (μ=2, σ=0.6)', () => {
    const rng = new SeededRng(42);
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const m = sampleTieredMaterial(0, rng);
      counts.set(m.tier, (counts.get(m.tier) ?? 0) + 1);
    }
    expect((counts.get(2) ?? 0) / 1000).toBeGreaterThan(0.75);
  });

  it('L10 samples are concentrated at t7-t9', () => {
    const rng = new SeededRng(7);
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const m = sampleTieredMaterial(10, rng);
      counts.set(m.tier, (counts.get(m.tier) ?? 0) + 1);
    }
    const highFreq = ((counts.get(7) ?? 0) + (counts.get(8) ?? 0) + (counts.get(9) ?? 0)) / 1000;
    expect(highFreq).toBeGreaterThan(0.7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/materials.test.ts`
Expected: FAIL — `sampleTieredMaterial`, `tieredMean`, `tieredSigma` undefined.

- [ ] **Step 3: Implement the helpers**

Append to `src/game/materials.ts`:

```typescript
// Two-bucket material model (spec §1): filler (t1 Dirt) vs tiered (t2-t9).
// `sampleTieredMaterial` draws from a truncated-normal distribution whose
// mean shifts right with the in-run Asteroid Quality upgrade level.
//
// μ(L) = clamp(2 + 0.6L, 2, 9)
// σ(L) = clamp(0.6 + 0.08L, 0.5, 1.5)
//
// Draw x ~ N(μ, σ) via Box-Muller, round to nearest int, clamp to [2, 9].

export function tieredMean(qualityLevel: number): number {
  return Math.max(2, Math.min(9, 2 + qualityLevel * 0.6));
}

export function tieredSigma(qualityLevel: number): number {
  return Math.max(0.5, Math.min(1.5, 0.6 + qualityLevel * 0.08));
}

function boxMuller(rng: SeededRng): number {
  // Standard normal via Box-Muller; u1 > 0 required.
  let u1 = rng.next();
  if (u1 < 1e-9) u1 = 1e-9;
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sampleTieredMaterial(qualityLevel: number, rng: SeededRng): Material {
  const mu = tieredMean(qualityLevel);
  const sigma = tieredSigma(qualityLevel);
  const x = mu + sigma * boxMuller(rng);
  const tier = Math.max(2, Math.min(9, Math.round(x)));
  const mat = materialByTier(tier);
  if (!mat) throw new Error(`sampleTieredMaterial: no material for tier ${tier}`);
  return mat;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/materials.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `asteroidSpawner.ts` to accept `fillerFraction` and route buckets**

Replace body of `spawnOne` in `src/game/asteroidSpawner.ts` with:

```typescript
import type Phaser from 'phaser';
import { CompoundAsteroid } from './compoundAsteroid';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { MATERIALS, sampleTieredMaterial, type Material } from './materials';
import { SeededRng } from './rng';

export interface AsteroidSpawnParams {
  readonly minChunks: number;
  readonly maxChunks: number;
  readonly hpMultiplier: number;
  readonly qualityLevel: number;
  readonly fallSpeedMultiplier: number;
  readonly fillerFraction: number; // 0-1; rolled per non-core chunk
}

const DIRT = MATERIALS[0]; // t1

export class AsteroidSpawner {
  constructor(private readonly scene: Phaser.Scene, private readonly seed?: number) {}

  spawnOne(worldX: number, worldY: number, params: AsteroidSpawnParams): CompoundAsteroid {
    const seed = this.seed ?? ((Math.random() * 0xffffffff) >>> 0 || 1);
    const rng = new SeededRng(seed);

    const span = Math.max(0, params.maxChunks - params.minChunks);
    const count = params.minChunks + rng.nextInt(span + 1);

    const generator = new CircularShapeGenerator(rng);
    const shape = generator.generate(count);

    const materialsByChunk = new Map<string, Material>();
    for (const entries of shape.chunksByCell.values()) {
      for (const entry of entries) {
        const isCore = entry.chunkId === shape.coreChunkId;
        if (isCore) {
          // Cores always tiered — guarantees Shards on vault kill.
          materialsByChunk.set(entry.chunkId, sampleTieredMaterial(params.qualityLevel, rng));
        } else if (rng.next() < params.fillerFraction) {
          materialsByChunk.set(entry.chunkId, DIRT);
        } else {
          materialsByChunk.set(entry.chunkId, sampleTieredMaterial(params.qualityLevel, rng));
        }
      }
    }

    return new CompoundAsteroid(
      this.scene, shape, worldX, worldY, params.hpMultiplier, materialsByChunk,
    );
  }
}
```

Note: the `seed` constructor arg is added here so Run Config (Task 10) can drive deterministic spawns. For this task, callers still pass no seed → random-per-spawn behavior unchanged.

- [ ] **Step 6: Update GameScene call site to pass `fillerFraction`**

In `src/scenes/GameScene.ts`, find the spot where `spawner.spawnOne(...)` is called and confirm it passes the full params object. Add `fillerFraction: 0.8` to the params. Example (exact location varies — grep for `spawnOne`):

```bash
grep -n "spawnOne" src/scenes/GameScene.ts
```

Add to the params object passed to `spawnOne`:

```typescript
fillerFraction: 0.8, // default; prestige Refinement will lower this in Task 5
```

- [ ] **Step 7: Verify typecheck + full vitest suite**

Run:
```bash
npm run typecheck
npm test
```
Expected: typecheck clean; all tests pass (count grows by 6 from Task 2 tests).

- [ ] **Step 8: Commit**

```bash
git add src/game/materials.ts src/game/materials.test.ts src/game/asteroidSpawner.ts src/scenes/GameScene.ts
git commit -m "prestige: two-bucket material distribution (filler Dirt + tiered Gaussian)"
```

---

## Task 3: Vault cores — HP multiplier + Shard award (§2)

**Files:**
- Modify: `src/game/compoundAsteroid.ts`
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add `vaultHpMultiplier` parameter to CompoundAsteroid**

In `src/game/compoundAsteroid.ts`, modify the constructor signature to accept an optional `vaultHpMultiplier` (default 10) and apply it to the core chunk's `maxHp`:

```typescript
constructor(
  scene: Phaser.Scene,
  shape: AsteroidShape,
  spawnX: number,
  spawnY: number,
  hpMultiplier: number,
  materialsByChunk: ReadonlyMap<string, Material>,
  vaultHpMultiplier = 10,
) {
  // ...existing body...
```

Find the loop `for (const info of partInfos) { ... }` and change the `maxHp` computation to:

```typescript
const baseHp = info.material.tier * hpMultiplier;
const maxHp = info.isCore ? baseHp * vaultHpMultiplier : baseHp;
```

- [ ] **Step 2: Write failing test for vault HP**

Add to `src/game/materials.test.ts` (or a new `compoundAsteroid.test.ts` — but this one has Matter.js coupling that's hard to unit-test, so we'll test via gameplayState flow in the next step instead). Skip this step; the core behavior is exercised by the Shard-award test below.

- [ ] **Step 3: Write failing test for Shard award on vault kill**

Create `src/game/prestigeAward.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { prestigeState } from './prestigeState';
import { computeVaultShardReward } from './prestigeAward';
import { materialByTier } from './materials';

beforeEach(() => {
  prestigeState.reset();
});

describe('computeVaultShardReward', () => {
  it('returns material tier with zero shard-yield bonus', () => {
    const t9 = materialByTier(9)!;
    expect(computeVaultShardReward(t9, 0)).toBe(9);
  });

  it('adds shard-yield bonus per level', () => {
    const t6 = materialByTier(6)!;
    expect(computeVaultShardReward(t6, 3)).toBe(9);
  });

  it('floors at 0 if tier somehow undefined', () => {
    expect(computeVaultShardReward(null as unknown as ReturnType<typeof materialByTier>, 0)).toBe(0);
  });
});
```

- [ ] **Step 4: Verify test fails**

Run: `npx vitest run src/game/prestigeAward.test.ts`
Expected: FAIL — `prestigeAward` missing.

- [ ] **Step 5: Implement the pure helper**

Create `src/game/prestigeAward.ts`:

```typescript
import type { Material } from './materials';

/**
 * Shards dropped by a vault-core chunk on death.
 * Spec §2: shardsDropped = coreMaterial.tier + shardYieldBonus.
 * Shard-yield bonus is the `shard.yield` prestige upgrade level (0–5).
 */
export function computeVaultShardReward(material: Material | null | undefined, shardYieldBonus: number): number {
  if (!material) return 0;
  return material.tier + Math.max(0, shardYieldBonus);
}
```

- [ ] **Step 6: Verify tests pass**

Run: `npx vitest run src/game/prestigeAward.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire Shard award into GameScene kill path**

In `src/scenes/GameScene.ts`, import:

```typescript
import { prestigeState } from '../game/prestigeState';
import { computeVaultShardReward } from '../game/prestigeAward';
```

Add a private field near the other counters:
```typescript
private pendingShardsThisRun = 0;
```

In `damageLiveChunk` (around line 380), after `const result = ast.damageChunk(chunkId, amount);` but inside the `if (!result.killed) return false;` guard, fetch the chunk's material + isCore BEFORE `extractDeadChunk` wipes it. Actually, `extractDeadChunk` returns `{ material, isCore }` — so award Shards from the extracted info:

Find this block:

```typescript
const extracted = ast.extractDeadChunk(chunkId);
if (extracted) this.spawnDeadConfettiChunk(extracted, killerType);
```

Replace with:

```typescript
const extracted = ast.extractDeadChunk(chunkId);
if (extracted) {
  this.spawnDeadConfettiChunk(extracted, killerType);
  if (extracted.isCore) {
    const shardYieldBonus = 0; // wired to prestige upgrade in Task 5
    const shards = computeVaultShardReward(extracted.material, shardYieldBonus);
    if (shards > 0) {
      this.pendingShardsThisRun += shards;
      this.events.emit('pendingShardsChanged', this.pendingShardsThisRun, shards);
    }
  }
}
```

Add a getter for UIScene to read:
```typescript
getPendingShardsThisRun(): number { return this.pendingShardsThisRun; }
```

And on reset (in the path where `gameplayState.resetData()` runs — grep for `resetData` in GameScene):
```typescript
this.pendingShardsThisRun = 0;
```

- [ ] **Step 8: Typecheck + full suite**

Run:
```bash
npm run typecheck
npm test
```
Expected: clean, all pass.

- [ ] **Step 9: Commit**

```bash
git add src/game/compoundAsteroid.ts src/game/prestigeAward.ts src/game/prestigeAward.test.ts src/scenes/GameScene.ts
git commit -m "prestige: vault cores (10x HP) + pending-shard accumulator on core kill"
```

---

## Task 4: Prestige shop catalog (§3 data)

**Files:**
- Create: `src/game/prestigeShopCatalog.ts`
- Create: `src/game/prestigeShopCatalog.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/prestigeShopCatalog.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PRESTIGE_SHOP, findShopEntry, shopCostAtLevel, isShopMaxed,
} from './prestigeShopCatalog';

describe('prestigeShopCatalog', () => {
  it('defines exactly 11 entries', () => {
    expect(PRESTIGE_SHOP.length).toBe(11);
  });

  it('includes all four free-weapon slots', () => {
    const freeIds = PRESTIGE_SHOP.filter(e => e.family === 'free-weapon').map(e => e.id);
    expect(freeIds.sort()).toEqual(['free.blackhole', 'free.laser', 'free.missile', 'free.saw']);
  });

  it('findShopEntry returns entry by id', () => {
    const e = findShopEntry('mult.cash');
    expect(e?.family).toBe('multiplier');
  });

  it('shopCostAtLevel grows by growthRate', () => {
    const e = findShopEntry('mult.cash')!;
    expect(shopCostAtLevel(e, 0)).toBe(Math.floor(e.baseCost));
    expect(shopCostAtLevel(e, 1)).toBe(Math.floor(e.baseCost * e.growthRate));
    expect(shopCostAtLevel(e, 2)).toBe(Math.floor(e.baseCost * e.growthRate ** 2));
  });

  it('isShopMaxed respects max level; infinite is Infinity', () => {
    const refinement = findShopEntry('refinement')!;
    expect(refinement.maxLevel).toBe(6);
    expect(isShopMaxed(refinement, 6)).toBe(true);
    expect(isShopMaxed(refinement, 5)).toBe(false);

    const freeSaw = findShopEntry('free.saw')!;
    expect(freeSaw.maxLevel).toBe(Infinity);
    expect(isShopMaxed(freeSaw, 100)).toBe(false);
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/game/prestigeShopCatalog.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the catalog**

Create `src/game/prestigeShopCatalog.ts`:

```typescript
export type PrestigeFamily = 'free-weapon' | 'multiplier' | 'material' | 'economy';

export interface PrestigeShopEntry {
  readonly id: string;
  readonly family: PrestigeFamily;
  readonly name: string;
  readonly description: string;
  readonly baseCost: number;
  readonly growthRate: number;
  readonly maxLevel: number; // Infinity for unbounded
}

// Spec §3. All costs / growth rates are placeholders; tunable in one file.
export const PRESTIGE_SHOP: readonly PrestigeShopEntry[] = [
  { id: 'free.saw',         family: 'free-weapon', name: 'Free Saw',        description: 'First +1 Saw in-run costs $0',        baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'free.laser',       family: 'free-weapon', name: 'Free Laser',      description: 'First +1 Laser in-run costs $0',      baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'free.missile',     family: 'free-weapon', name: 'Free Missile',    description: 'First +1 Missile in-run costs $0',    baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'free.blackhole',   family: 'free-weapon', name: 'Free Blackhole',  description: 'First +1 Blackhole in-run costs $0',  baseCost: 3,  growthRate: 1.6, maxLevel: Infinity },
  { id: 'mult.cash',        family: 'multiplier',  name: 'Cash Multiplier', description: '+10% cash earned globally per level', baseCost: 5,  growthRate: 1.4, maxLevel: Infinity },
  { id: 'mult.damage',      family: 'multiplier',  name: 'Damage Multiplier', description: '+5% weapon damage per level',       baseCost: 6,  growthRate: 1.4, maxLevel: Infinity },
  { id: 'discount.upgrade', family: 'multiplier',  name: 'Upgrade Discount', description: '-5% in-run upgrade cost (cap -50%)', baseCost: 8,  growthRate: 1.5, maxLevel: 10 },
  { id: 'refinement',       family: 'material',    name: 'Refinement',      description: 'Filler -5% per level (floor 50%)',   baseCost: 20, growthRate: 2.0, maxLevel: 6 },
  { id: 'offline.cap',      family: 'economy',     name: 'Offline Cap',     description: 'Offline cap: 8h → 12h → 24h → 48h',   baseCost: 25, growthRate: 3.0, maxLevel: 3 },
  { id: 'shard.yield',      family: 'economy',     name: 'Shard Yield',     description: '+1 Shard per vault core per level',  baseCost: 30, growthRate: 2.0, maxLevel: 5 },
  { id: 'start.cash',       family: 'economy',     name: 'Starting Cash',   description: '+$50 starting cash per level',        baseCost: 5,  growthRate: 1.5, maxLevel: Infinity },
];

export function findShopEntry(id: string): PrestigeShopEntry | undefined {
  return PRESTIGE_SHOP.find((e) => e.id === id);
}

export function shopCostAtLevel(entry: PrestigeShopEntry, currentLevel: number): number {
  return Math.floor(entry.baseCost * Math.pow(entry.growthRate, currentLevel));
}

export function isShopMaxed(entry: PrestigeShopEntry, currentLevel: number): boolean {
  return currentLevel >= entry.maxLevel;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/game/prestigeShopCatalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/prestigeShopCatalog.ts src/game/prestigeShopCatalog.test.ts
git commit -m "prestige: shop catalog — 11 entries across 4 families"
```

---

## Task 5: Prestige effects → EffectiveGameplayParams (§3 integration)

**Files:**
- Modify: `src/game/upgradeApplier.ts`
- Create: `src/game/prestigeEffects.ts`
- Create: `src/game/prestigeEffects.test.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Extend `EffectiveGameplayParams`**

In `src/game/upgradeApplier.ts`, extend the interface and `BASE_PARAMS`:

```typescript
export interface EffectiveGameplayParams {
  // ...existing fields unchanged...
  readonly cashMultiplier: number;
  readonly damageMultiplier: number;
  readonly upgradeCostMultiplier: number;
  readonly fillerFraction: number;
  readonly offlineCapMs: number;
  readonly shardYieldBonus: number;
  readonly freeSlotCount: Readonly<Record<string, number>>;
  readonly startingCash: number;
}

export const BASE_PARAMS: EffectiveGameplayParams = {
  // ...existing fields unchanged...
  cashMultiplier: 1,
  damageMultiplier: 1,
  upgradeCostMultiplier: 1,
  fillerFraction: 0.8,
  offlineCapMs: 8 * 60 * 60 * 1000,
  shardYieldBonus: 0,
  freeSlotCount: { saw: 0, laser: 0, missile: 0, blackhole: 0 },
  startingCash: 0,
};
```

And at the end of `applyUpgrades`, copy the prestige-driven fields from BASE_PARAMS through unmodified:

```typescript
return {
  // ...existing computed fields...
  cashMultiplier: BASE_PARAMS.cashMultiplier,
  damageMultiplier: BASE_PARAMS.damageMultiplier,
  upgradeCostMultiplier: BASE_PARAMS.upgradeCostMultiplier,
  fillerFraction: BASE_PARAMS.fillerFraction,
  offlineCapMs: BASE_PARAMS.offlineCapMs,
  shardYieldBonus: BASE_PARAMS.shardYieldBonus,
  freeSlotCount: BASE_PARAMS.freeSlotCount,
  startingCash: BASE_PARAMS.startingCash,
};
```

(prestige levels will override these via `applyPrestigeEffects` in step 2.)

- [ ] **Step 2: Write failing tests for `applyPrestigeEffects`**

Create `src/game/prestigeEffects.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_PARAMS } from './upgradeApplier';
import { applyPrestigeEffects } from './prestigeEffects';

describe('applyPrestigeEffects', () => {
  it('returns BASE_PARAMS unchanged with empty prestige levels', () => {
    const out = applyPrestigeEffects(BASE_PARAMS, {});
    expect(out.cashMultiplier).toBe(1);
    expect(out.damageMultiplier).toBe(1);
    expect(out.upgradeCostMultiplier).toBe(1);
    expect(out.fillerFraction).toBe(0.8);
    expect(out.shardYieldBonus).toBe(0);
    expect(out.startingCash).toBe(0);
    expect(out.freeSlotCount.saw).toBe(0);
  });

  it('mult.cash: +10% per level', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'mult.cash': 3 }).cashMultiplier).toBeCloseTo(1.3);
  });

  it('mult.damage: +5% per level', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'mult.damage': 4 }).damageMultiplier).toBeCloseTo(1.2);
  });

  it('discount.upgrade: -5% per level, capped at -50%', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'discount.upgrade': 3 }).upgradeCostMultiplier).toBeCloseTo(0.85);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'discount.upgrade': 100 }).upgradeCostMultiplier).toBe(0.5);
  });

  it('refinement: filler -5% per level, floor 50%', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { refinement: 2 }).fillerFraction).toBeCloseTo(0.7);
    expect(applyPrestigeEffects(BASE_PARAMS, { refinement: 100 }).fillerFraction).toBe(0.5);
  });

  it('offline.cap: [8h, 12h, 24h, 48h] steps', () => {
    const h = 60 * 60 * 1000;
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 0 }).offlineCapMs).toBe(8 * h);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 1 }).offlineCapMs).toBe(12 * h);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 2 }).offlineCapMs).toBe(24 * h);
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 3 }).offlineCapMs).toBe(48 * h);
    // Over-max stays at 48h.
    expect(applyPrestigeEffects(BASE_PARAMS, { 'offline.cap': 99 }).offlineCapMs).toBe(48 * h);
  });

  it('shard.yield: +1 per level', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'shard.yield': 4 }).shardYieldBonus).toBe(4);
  });

  it('start.cash: +$50 per level', () => {
    expect(applyPrestigeEffects(BASE_PARAMS, { 'start.cash': 3 }).startingCash).toBe(150);
  });

  it('free.saw / free.laser / free.missile / free.blackhole → freeSlotCount map', () => {
    const out = applyPrestigeEffects(BASE_PARAMS, {
      'free.saw': 2, 'free.laser': 1, 'free.missile': 0, 'free.blackhole': 3,
    });
    expect(out.freeSlotCount.saw).toBe(2);
    expect(out.freeSlotCount.laser).toBe(1);
    expect(out.freeSlotCount.missile).toBe(0);
    expect(out.freeSlotCount.blackhole).toBe(3);
  });
});
```

- [ ] **Step 3: Verify test fails**

Run: `npx vitest run src/game/prestigeEffects.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `src/game/prestigeEffects.ts`:

```typescript
import type { EffectiveGameplayParams } from './upgradeApplier';

const H = 60 * 60 * 1000;
const OFFLINE_CAP_TIERS = [8 * H, 12 * H, 24 * H, 48 * H];

export function applyPrestigeEffects(
  params: EffectiveGameplayParams,
  shopLevels: Readonly<Record<string, number>>,
): EffectiveGameplayParams {
  const lv = (id: string): number => shopLevels[id] ?? 0;

  const offlineIdx = Math.max(0, Math.min(OFFLINE_CAP_TIERS.length - 1, lv('offline.cap')));

  return {
    ...params,
    cashMultiplier: 1 + 0.10 * lv('mult.cash'),
    damageMultiplier: 1 + 0.05 * lv('mult.damage'),
    upgradeCostMultiplier: Math.max(0.5, 1 - 0.05 * lv('discount.upgrade')),
    fillerFraction: Math.max(0.5, 0.8 - 0.05 * lv('refinement')),
    offlineCapMs: OFFLINE_CAP_TIERS[offlineIdx],
    shardYieldBonus: lv('shard.yield'),
    freeSlotCount: {
      saw: lv('free.saw'),
      laser: lv('free.laser'),
      missile: lv('free.missile'),
      blackhole: lv('free.blackhole'),
    },
    startingCash: 50 * lv('start.cash'),
  };
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run src/game/prestigeEffects.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Wire into GameScene**

In `src/scenes/GameScene.ts`, find where `applyUpgrades(gameplayState.levels())` is called (grep `applyUpgrades`). Wrap the result:

```typescript
import { prestigeState } from '../game/prestigeState';
import { applyPrestigeEffects } from '../game/prestigeEffects';
```

Then:
```typescript
this.effectiveParams = applyPrestigeEffects(
  applyUpgrades(gameplayState.levels()),
  prestigeState.shopLevels(),
);
```

Use `effectiveParams.fillerFraction` where the spawner was previously hardcoded to `0.8` in Task 2. Use `effectiveParams.shardYieldBonus` in the Shard-award computation in Task 3 (replace the `const shardYieldBonus = 0` placeholder).

Apply damage multiplier to weapon damage: find every place `effectiveParams.sawDamage`, `laserDamage`, `missileDamage`, `blackholeCoreDamage`, `grinderDamage` are passed to behaviors and multiply by `effectiveParams.damageMultiplier`. Simpler: inside `applyPrestigeEffects`, do the multiplication once and return the scaled params. Update `applyPrestigeEffects`:

```typescript
const dmg = 1 + 0.05 * lv('mult.damage');
return {
  ...params,
  sawDamage: params.sawDamage * dmg,
  laserDamage: params.laserDamage * dmg,
  missileDamage: params.missileDamage * dmg,
  blackholeCoreDamage: params.blackholeCoreDamage * dmg,
  grinderDamage: params.grinderDamage * dmg,
  damageMultiplier: dmg,
  // ...rest as before
};
```

Apply cash multiplier: in GameScene's `collectDeadAtDeathLine` (line ~438–448) and anywhere else `gameplayState.addCash(reward)` is called for kill rewards, multiply `reward` by `this.effectiveParams.cashMultiplier`. Use `Math.floor(reward * mult)` to keep cash integer.

Apply starting cash: in the `create()` path where `gameplayState.resetData()` runs without a loaded snapshot, follow with:
```typescript
gameplayState.addCash(this.effectiveParams.startingCash, { silent: true });
```

- [ ] **Step 7: Typecheck + full suite**

Run:
```bash
npm run typecheck
npm test
```
Expected: clean. (`upgradeApplier.test.ts` may need updates to assert new BASE_PARAMS fields — add a minimal check that `cashMultiplier === 1` etc. if the existing tests use strict object equality. If they only spot-check fields, no change needed.)

- [ ] **Step 8: Commit**

```bash
git add src/game/upgradeApplier.ts src/game/prestigeEffects.ts src/game/prestigeEffects.test.ts src/game/upgradeApplier.test.ts src/scenes/GameScene.ts
git commit -m "prestige: apply shop effects into EffectiveGameplayParams (cash, damage, filler, shards, starting cash)"
```

---

## Task 6: Free-slot price override + per-run purchase counter (§3)

**Files:**
- Modify: `src/game/gameplayState.ts`
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/weaponCatalog.test.ts`
- Modify: `src/game/gameplayState.test.ts`
- Modify: `src/scenes/UIScene.ts` (or wherever weapon buy is wired)

- [ ] **Step 1: Add `instancesBoughtThisRun` to gameplayState**

In `src/game/gameplayState.ts`:

Add private field:
```typescript
private readonly _instancesBoughtThisRun = new Map<string, number>();
```

Add public API:
```typescript
instancesBoughtThisRun(id: string): number {
  return this._instancesBoughtThisRun.get(id) ?? 0;
}

allInstancesBoughtThisRun(): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [k, v] of this._instancesBoughtThisRun) out[k] = v;
  return out;
}
```

In `buyWeapon`, increment the counter:
```typescript
buyWeapon(id: string): void {
  const current = this.weaponCount(id);
  this._weaponCounts.set(id, current + 1);
  const bought = this._instancesBoughtThisRun.get(id) ?? 0;
  this._instancesBoughtThisRun.set(id, bought + 1);
  this.emit('weaponCountChanged', id, current + 1);
}
```

In `resetData`, clear it:
```typescript
resetData(): void {
  this._cash = 0;
  this._levels.clear();
  this._weaponCounts.clear();
  this._instancesBoughtThisRun.clear();
}
```

Add a setter for save/load:
```typescript
setInstancesBoughtThisRun(m: Record<string, number>): void {
  this._instancesBoughtThisRun.clear();
  for (const [k, v] of Object.entries(m)) this._instancesBoughtThisRun.set(k, v);
}
```

- [ ] **Step 2: Write failing test for buy-cost override**

Add to `src/game/weaponCatalog.test.ts`:

```typescript
import { weaponBuyCost } from './weaponCatalog';

describe('weaponBuyCost', () => {
  it('returns 0 when boughtThisRun < freeSlots', () => {
    expect(weaponBuyCost({ boughtThisRun: 0, freeSlots: 2, baseCost: 100 })).toBe(0);
    expect(weaponBuyCost({ boughtThisRun: 1, freeSlots: 2, baseCost: 100 })).toBe(0);
  });

  it('returns baseCost when boughtThisRun >= freeSlots', () => {
    expect(weaponBuyCost({ boughtThisRun: 2, freeSlots: 2, baseCost: 100 })).toBe(100);
    expect(weaponBuyCost({ boughtThisRun: 5, freeSlots: 2, baseCost: 100 })).toBe(100);
  });

  it('returns baseCost when freeSlots is 0', () => {
    expect(weaponBuyCost({ boughtThisRun: 0, freeSlots: 0, baseCost: 50 })).toBe(50);
  });
});
```

- [ ] **Step 3: Verify test fails**

Run: `npx vitest run src/game/weaponCatalog.test.ts`
Expected: FAIL — `weaponBuyCost` missing.

- [ ] **Step 4: Implement**

Append to `src/game/weaponCatalog.ts`:

```typescript
export interface WeaponBuyCostArgs {
  readonly boughtThisRun: number;
  readonly freeSlots: number;
  readonly baseCost: number;
}

export function weaponBuyCost({ boughtThisRun, freeSlots, baseCost }: WeaponBuyCostArgs): number {
  if (boughtThisRun < freeSlots) return 0;
  return baseCost;
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run src/game/weaponCatalog.test.ts src/game/gameplayState.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire into UIScene buy flow**

In `src/scenes/UIScene.ts`, find where the weapon-buy button computes cost and triggers purchase (grep `weaponCount`, `buyWeapon`, or `buy`). Wrap the cost with `weaponBuyCost(...)`:

```typescript
import { weaponBuyCost } from '../game/weaponCatalog';

// Where current cost is computed for a Saw/Laser/Missile/Blackhole buy button:
const bought = gameplayState.instancesBoughtThisRun(weaponId);
const freeSlots = this.effectiveParams.freeSlotCount[weaponId] ?? 0;
const baseCost = /* whatever the existing formula is (1, scaled, etc.) */;
const cost = weaponBuyCost({ boughtThisRun: bought, freeSlots, baseCost });
```

Also apply `effectiveParams.upgradeCostMultiplier` to upgrade button cost displays (grep `costAtLevel` in UIScene): `Math.floor(costAtLevel(def, lv) * effectiveParams.upgradeCostMultiplier)`.

- [ ] **Step 7: Typecheck + suite**

```bash
npm run typecheck
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/game/gameplayState.ts src/game/gameplayState.test.ts src/game/weaponCatalog.ts src/game/weaponCatalog.test.ts src/scenes/UIScene.ts
git commit -m "prestige: free-weapon slot override + per-run buy counter"
```

---

## Task 7: Save state v1 → v2 migration (§5)

**Files:**
- Modify: `src/game/saveState.ts`
- Modify: `src/game/saveState.test.ts`
- Modify: `src/main.ts`
- Modify: `src/scenes/GameScene.ts` (autosave path)

- [ ] **Step 1: Write failing tests for v2 + migration**

Add to `src/game/saveState.test.ts`:

```typescript
import {
  deserialize, serialize, SAVE_STATE_VERSION,
  type SaveStateV2,
} from './saveState';

describe('SaveStateV2', () => {
  const validV2: SaveStateV2 = {
    v: 2,
    cash: 100,
    levels: { 'saw.damage': 2 },
    weaponCounts: { grinder: 1, saw: 1 },
    weaponInstances: [{ typeId: 'saw', x: 100, y: 500, clockwise: true }],
    emaCashPerSec: 1.5,
    savedAt: 1700000000000,
    runSeed: 'cosmic-dust-123',
    pendingShardsThisRun: 7,
    prestigeShards: 42,
    prestigeCount: 3,
    prestigeShopLevels: { 'mult.cash': 2 },
    instancesBoughtThisRun: { saw: 1 },
  };

  it('SAVE_STATE_VERSION is 2', () => {
    expect(SAVE_STATE_VERSION).toBe(2);
  });

  it('serialize/deserialize round-trips v2', () => {
    const round = deserialize(serialize(validV2));
    expect(round).toEqual(validV2);
  });

  it('migrates v1 payload to v2 with default prestige fields', () => {
    const v1 = {
      v: 1, cash: 50,
      levels: { 'saw.damage': 1 },
      weaponCounts: { grinder: 1, saw: 1 },
      weaponInstances: [],
      emaCashPerSec: 0,
      savedAt: 1700000000000,
    };
    const migrated = deserialize(JSON.stringify(v1));
    expect(migrated).not.toBeNull();
    expect(migrated!.v).toBe(2);
    expect(migrated!.cash).toBe(50);
    expect(migrated!.prestigeShards).toBe(0);
    expect(migrated!.prestigeCount).toBe(0);
    expect(migrated!.prestigeShopLevels).toEqual({});
    expect(migrated!.pendingShardsThisRun).toBe(0);
    expect(migrated!.instancesBoughtThisRun).toEqual({});
    expect(typeof migrated!.runSeed).toBe('string');
    expect(migrated!.runSeed.length).toBeGreaterThan(0);
  });

  it('rejects v > 2', () => {
    expect(deserialize(JSON.stringify({ ...validV2, v: 3 }))).toBeNull();
  });

  it('rejects garbage', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{}')).toBeNull();
  });
});
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/game/saveState.test.ts`
Expected: FAIL — `SAVE_STATE_VERSION`, `SaveStateV2`, migration missing.

- [ ] **Step 3: Rewrite `saveState.ts`**

Replace `src/game/saveState.ts` with:

```typescript
export interface SavedWeaponInstance {
  typeId: string;
  x: number;
  y: number;
  clockwise?: boolean;
}

export interface SaveStateV1 {
  v: 1;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstances: SavedWeaponInstance[];
  emaCashPerSec: number;
  savedAt: number;
}

export interface SaveStateV2 {
  v: 2;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstances: SavedWeaponInstance[];
  emaCashPerSec: number;
  savedAt: number;
  runSeed: string;
  pendingShardsThisRun: number;
  prestigeShards: number;
  prestigeCount: number;
  prestigeShopLevels: Record<string, number>;
  instancesBoughtThisRun: Record<string, number>;
}

export const SAVE_STATE_VERSION = 2;
export const STORAGE_KEY = 'asteroid-grinder:save:v2';
export const STORAGE_KEY_V1 = 'asteroid-grinder:save:v1';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const MIN_OFFLINE_MS = 60 * 1000;

export function serialize(state: SaveStateV2): string {
  return JSON.stringify(state);
}

function randomSeed(): string {
  return `cosmic-dust-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function migrateV1(p: SaveStateV1): SaveStateV2 {
  return {
    v: 2,
    cash: p.cash,
    levels: p.levels,
    weaponCounts: p.weaponCounts,
    weaponInstances: p.weaponInstances,
    emaCashPerSec: p.emaCashPerSec,
    savedAt: p.savedAt,
    runSeed: randomSeed(),
    pendingShardsThisRun: 0,
    prestigeShards: 0,
    prestigeCount: 0,
    prestigeShopLevels: {},
    instancesBoughtThisRun: {},
  };
}

function validateBase(p: Partial<SaveStateV1 | SaveStateV2>): boolean {
  if (typeof p.cash !== 'number') return false;
  if (!p.levels || typeof p.levels !== 'object') return false;
  for (const v of Object.values(p.levels)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  if (!p.weaponCounts || typeof p.weaponCounts !== 'object') return false;
  for (const v of Object.values(p.weaponCounts)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  if (!Array.isArray(p.weaponInstances)) return false;
  for (const inst of p.weaponInstances) {
    if (!inst || typeof inst !== 'object') return false;
    if (typeof inst.typeId !== 'string') return false;
    if (typeof inst.x !== 'number' || typeof inst.y !== 'number') return false;
    if (inst.clockwise !== undefined && typeof inst.clockwise !== 'boolean') return false;
  }
  if (typeof p.emaCashPerSec !== 'number') return false;
  if (typeof p.savedAt !== 'number') return false;
  return true;
}

export function deserialize(json: string): SaveStateV2 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SaveStateV2>;
  if (p.v === 1) {
    if (!validateBase(p as Partial<SaveStateV1>)) return null;
    return migrateV1(p as SaveStateV1);
  }
  if (p.v !== 2) return null;
  if (!validateBase(p)) return null;
  if (typeof p.runSeed !== 'string') return null;
  if (typeof p.pendingShardsThisRun !== 'number') return null;
  if (typeof p.prestigeShards !== 'number') return null;
  if (typeof p.prestigeCount !== 'number') return null;
  if (!p.prestigeShopLevels || typeof p.prestigeShopLevels !== 'object') return null;
  for (const v of Object.values(p.prestigeShopLevels)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  }
  if (!p.instancesBoughtThisRun || typeof p.instancesBoughtThisRun !== 'object') return null;
  for (const v of Object.values(p.instancesBoughtThisRun)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  }
  return p as SaveStateV2;
}

export function saveToLocalStorage(state: SaveStateV2): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // silent
  }
}

export function loadFromLocalStorage(): SaveStateV2 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return deserialize(raw);
    // Fallback: migrate an old v1 save if present.
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (!rawV1) return null;
    const migrated = deserialize(rawV1);
    if (migrated) {
      saveToLocalStorage(migrated);
      localStorage.removeItem(STORAGE_KEY_V1);
    }
    return migrated;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Update main.ts and GameScene autosave**

In `src/main.ts`, seed `prestigeState` from the snapshot:

```typescript
import { prestigeState } from './game/prestigeState';

// After `const snapshot = loadFromLocalStorage();`
if (snapshot) {
  prestigeState.loadSnapshot({
    shards: snapshot.prestigeShards,
    prestigeCount: snapshot.prestigeCount,
    shopLevels: snapshot.prestigeShopLevels,
  });
}
```

Also replace `OFFLINE_CAP_MS` import usage with a runtime-computed cap: after loading prestige state,

```typescript
import { applyPrestigeEffects } from './game/prestigeEffects';
import { BASE_PARAMS } from './game/upgradeApplier';

const prestigeParams = applyPrestigeEffects(BASE_PARAMS, prestigeState.shopLevels());
const offlineCap = prestigeParams.offlineCapMs;
```

Pass `offlineCap` into `computeOfflineAward` instead of the constant, and into the registry.

In `src/scenes/GameScene.ts`, find the autosave builder (grep `saveToLocalStorage`) and populate new fields:

```typescript
const snap: SaveStateV2 = {
  v: 2,
  cash: gameplayState.cash,
  levels: gameplayState.levels(),
  weaponCounts: { /* ...existing... */ },
  weaponInstances: /* ...existing... */,
  emaCashPerSec: this.rateTracker.getRate(),
  savedAt: Date.now(),
  runSeed: gameplayState.runSeed ?? '',
  pendingShardsThisRun: this.pendingShardsThisRun,
  prestigeShards: prestigeState.shards,
  prestigeCount: prestigeState.prestigeCount,
  prestigeShopLevels: prestigeState.shopLevels(),
  instancesBoughtThisRun: gameplayState.allInstancesBoughtThisRun(),
};
saveToLocalStorage(snap);
```

(Add `runSeed` field to `gameplayState` — see Task 10. For this task, a no-op default `''` is fine.)

For load, in `create()` where `gameplayState.loadSnapshot` runs from `pendingSnapshot`, also restore:

```typescript
this.pendingShardsThisRun = snap.pendingShardsThisRun ?? 0;
gameplayState.setInstancesBoughtThisRun(snap.instancesBoughtThisRun ?? {});
```

- [ ] **Step 5: Typecheck + suite**

```bash
npm run typecheck
npm test
```
Expected: PASS. Any old `SaveStateV1` import references need updating to `SaveStateV2`.

- [ ] **Step 6: Commit**

```bash
git add src/game/saveState.ts src/game/saveState.test.ts src/main.ts src/scenes/GameScene.ts
git commit -m "prestige: save state v2 with transparent v1 migration"
```

---

## Task 8: Bottom bar UI + Prestige button + confirmation modal (§4)

**Files:**
- Modify: `src/scenes/UIScene.ts`
- Modify: `src/scenes/GameScene.ts` (reset-on-confirm path)

- [ ] **Step 1: Add bottom-bar HUD in UIScene**

In `src/scenes/UIScene.ts`, in `create()`:

```typescript
import { prestigeState } from '../game/prestigeState';

// Near top of create(), after other HUD setup:
const H = this.scale.height;
const W = this.scale.width;
const BAR_H = 72;

const barBg = this.add.rectangle(0, H - BAR_H, W, BAR_H, 0x0c0c14, 0.85).setOrigin(0, 0).setDepth(50);
const cashText = this.add.text(24, H - BAR_H + 16, '', { fontSize: '32px', color: '#ffe082' }).setDepth(51);
const shardsText = this.add.text(420, H - BAR_H + 16, '', { fontSize: '32px', color: '#c9a0ff' }).setDepth(51);
const prestigeCountText = this.add.text(1100, H - BAR_H + 20, '', { fontSize: '24px', color: '#aaaaff' }).setDepth(51);
const prestigeBtn = this.add.text(W - 260, H - BAR_H + 14, '🔮 Prestige →', {
  fontSize: '30px', color: '#ffffff', backgroundColor: '#5a2fbe', padding: { x: 14, y: 8 },
}).setInteractive({ useHandCursor: true }).setDepth(51);

const refresh = (): void => {
  const gs = this.game.scene.getScene('game') as GameScene | null;
  const pending = gs?.getPendingShardsThisRun?.() ?? 0;
  cashText.setText(`$${gameplayState.cash}`);
  shardsText.setText(`🔮 ${pending} this run (banked: ${prestigeState.shards})`);
  prestigeCountText.setText(`prestige #${prestigeState.prestigeCount}`);
};
refresh();

this.unsubs.push(gameplayState.on('cashChanged', refresh));
this.unsubs.push(prestigeState.on('shardsChanged', refresh));
this.unsubs.push(prestigeState.on('prestigeRegistered', refresh));
const gs = this.game.scene.getScene('game') as Phaser.Scene;
const pendingHandler = (): void => refresh();
gs.events.on('pendingShardsChanged', pendingHandler);
this.unsubs.push(() => gs.events.off('pendingShardsChanged', pendingHandler));

prestigeBtn.on('pointerdown', () => this.openPrestigeModal());
```

- [ ] **Step 2: Add the confirmation modal**

Add private method `openPrestigeModal` in UIScene:

```typescript
private prestigeModal: Phaser.GameObjects.Container | null = null;

private openPrestigeModal(): void {
  if (this.prestigeModal) return;
  const gs = this.game.scene.getScene('game') as GameScene;
  const pending = gs.getPendingShardsThisRun();

  const W = this.scale.width;
  const H = this.scale.height;
  const cx = W / 2;
  const cy = H / 2;

  const container = this.add.container(0, 0).setDepth(200);
  const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive();
  const panel = this.add.rectangle(cx, cy, 720, 420, 0x1a1a28).setStrokeStyle(4, 0x5a2fbe);
  const title = this.add.text(cx, cy - 160, 'Prestige now?', { fontSize: '44px', color: '#ffffff' }).setOrigin(0.5);
  const body1 = this.add.text(cx, cy - 80, 'Resets: cash, in-run upgrades,\nall placed weapons.', {
    fontSize: '28px', color: '#d0d0e0', align: 'center',
  }).setOrigin(0.5);
  const body2 = this.add.text(cx, cy, 'Keeps: 🔮 Shards + Prestige Shop.', {
    fontSize: '28px', color: '#d0d0e0',
  }).setOrigin(0.5);
  const gain = this.add.text(cx, cy + 60, `You will gain: 🔮 ${pending} Shards`, {
    fontSize: '32px', color: '#c9a0ff',
  }).setOrigin(0.5);
  const cancel = this.add.text(cx - 120, cy + 150, 'Cancel', {
    fontSize: '30px', color: '#ffffff', backgroundColor: '#4a4a5a', padding: { x: 20, y: 10 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  const confirm = this.add.text(cx + 120, cy + 150, 'Prestige', {
    fontSize: '30px', color: '#ffffff', backgroundColor: '#5a2fbe', padding: { x: 20, y: 10 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  container.add([backdrop, panel, title, body1, body2, gain, cancel, confirm]);
  this.prestigeModal = container;

  cancel.on('pointerdown', () => this.closePrestigeModal());
  confirm.on('pointerdown', () => {
    this.closePrestigeModal();
    gs.confirmPrestige();
    this.openPrestigeShop();
  });
}

private closePrestigeModal(): void {
  this.prestigeModal?.destroy();
  this.prestigeModal = null;
}

private openPrestigeShop(): void {
  // Implemented in Task 9.
}
```

- [ ] **Step 3: Add `confirmPrestige()` to GameScene**

In `src/scenes/GameScene.ts`:

```typescript
confirmPrestige(): void {
  // Bank pending shards.
  if (this.pendingShardsThisRun > 0) {
    prestigeState.addShards(this.pendingShardsThisRun);
    this.pendingShardsThisRun = 0;
  }
  prestigeState.registerPrestige();

  // Wipe run. Destroy all weapon instances + asteroids first.
  for (const inst of this.weaponInstances) {
    inst.behavior.destroy();
    inst.sprite.destroy();
  }
  this.weaponInstances = [];
  for (const ast of this.liveAsteroids) ast.destroy();
  this.liveAsteroids = [];
  for (const d of this.deadChunks) d.destroy();
  this.deadChunks.clear();

  gameplayState.resetData();
  // Re-init weapon counts from defaults (1 grinder, 0 everything else).
  const defaults: Record<string, number> = {};
  for (const w of WEAPON_TYPES) defaults[w.id] = w.startCount;
  gameplayState.initWeaponCounts(defaults);

  // Save immediately so the shop screen's banked count is persisted even if the tab closes.
  this.persistNow();
  this.scene.restart();
}

private persistNow(): void {
  // Call the same autosave path used on interval/beforeunload.
  // If autosave is a private method, extract to a shared `buildSnapshot`
  // and call saveToLocalStorage here.
}
```

- [ ] **Step 4: Typecheck + build**

```bash
npm run typecheck
npm run build
```
Expected: clean. (No new vitest tests this task — modal behavior is UI, covered by Playwright smoke in Task 11.)

- [ ] **Step 5: Commit**

```bash
git add src/scenes/UIScene.ts src/scenes/GameScene.ts
git commit -m "prestige: bottom bar + prestige confirmation modal"
```

---

## Task 9: Prestige Shop sub-panel (§4)

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Implement `openPrestigeShop()` with scrollable rows**

In `src/scenes/UIScene.ts`, replace the stub from Task 8 with a real implementation. Below is a minimal working version — can be refined in the art pass.

```typescript
import { PRESTIGE_SHOP, shopCostAtLevel, isShopMaxed } from '../game/prestigeShopCatalog';

private prestigeShop: Phaser.GameObjects.Container | null = null;

private openPrestigeShop(): void {
  if (this.prestigeShop) return;
  const W = this.scale.width;
  const H = this.scale.height;

  const container = this.add.container(0, 0).setDepth(200);
  const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.92).setOrigin(0, 0).setInteractive();
  const title = this.add.text(W / 2, 80, 'Prestige Shop', { fontSize: '48px', color: '#ffffff' }).setOrigin(0.5);
  const shardsHeader = this.add.text(W / 2, 140, '', { fontSize: '32px', color: '#c9a0ff' }).setOrigin(0.5);
  container.add([backdrop, title, shardsHeader]);

  const rowsByFamily: Record<string, Phaser.GameObjects.Text[]> = {};
  const ROW_H = 56;
  const FAMILY_HEADERS: Array<[string, string]> = [
    ['free-weapon', 'FREE WEAPONS'],
    ['multiplier', 'MULTIPLIERS'],
    ['material', 'MATERIAL'],
    ['economy', 'ECONOMY'],
  ];

  let y = 220;
  for (const [family, headerLabel] of FAMILY_HEADERS) {
    const header = this.add.text(W / 2 - 500, y, headerLabel, { fontSize: '28px', color: '#9090c0' });
    container.add(header);
    y += 48;

    for (const entry of PRESTIGE_SHOP.filter((e) => e.family === family)) {
      const rowY = y;
      const label = this.add.text(W / 2 - 500, rowY, '', { fontSize: '24px', color: '#ffffff' });
      const btn = this.add.text(W / 2 + 400, rowY - 6, 'Buy', {
        fontSize: '24px', color: '#ffffff', backgroundColor: '#5a2fbe', padding: { x: 14, y: 6 },
      }).setInteractive({ useHandCursor: true });

      const refreshRow = (): void => {
        const lv = prestigeState.shopLevel(entry.id);
        const maxed = isShopMaxed(entry, lv);
        const cost = maxed ? 0 : shopCostAtLevel(entry, lv);
        const maxPart = Number.isFinite(entry.maxLevel) ? ` / ${entry.maxLevel}` : '';
        label.setText(`${entry.name}  ·  Lv ${lv}${maxPart}  ·  ${entry.description}`);
        if (maxed) {
          btn.setText('MAX').setBackgroundColor('#404050').disableInteractive();
        } else {
          btn.setText(`🔮 ${cost}`);
          if (prestigeState.shards >= cost) {
            btn.setBackgroundColor('#5a2fbe').setInteractive({ useHandCursor: true });
          } else {
            btn.setBackgroundColor('#2a1a4a');
          }
        }
      };

      btn.on('pointerdown', () => {
        const lv = prestigeState.shopLevel(entry.id);
        if (isShopMaxed(entry, lv)) return;
        const cost = shopCostAtLevel(entry, lv);
        if (!prestigeState.trySpend(cost)) return;
        prestigeState.setShopLevel(entry.id, lv + 1);
        refreshRow();
        shardsHeader.setText(`Banked: 🔮 ${prestigeState.shards}`);
      });

      container.add([label, btn]);
      rowsByFamily[entry.id] = [label, btn];
      refreshRow();
      y += ROW_H;
    }
    y += 24;
  }

  const nextBtn = this.add.text(W / 2, H - 80, 'Next → Run Config', {
    fontSize: '30px', color: '#ffffff', backgroundColor: '#3a7aff', padding: { x: 24, y: 12 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  nextBtn.on('pointerdown', () => {
    this.closePrestigeShop();
    this.openRunConfig();
  });
  container.add(nextBtn);

  shardsHeader.setText(`Banked: 🔮 ${prestigeState.shards}`);
  this.prestigeShop = container;
}

private closePrestigeShop(): void {
  this.prestigeShop?.destroy();
  this.prestigeShop = null;
}

private openRunConfig(): void {
  // Implemented in Task 10.
}
```

- [ ] **Step 2: Persist shop levels on purchase**

On shop-level change, trigger the existing autosave tick by emitting a gameplayState event — but cleanest is to subscribe in GameScene:

In `src/scenes/GameScene.ts` `create()`:

```typescript
this.unsubs.push(prestigeState.on('shopLevelChanged', () => this.persistNow()));
this.unsubs.push(prestigeState.on('shardsChanged', () => this.persistNow()));
```

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/scenes/UIScene.ts src/scenes/GameScene.ts
git commit -m "prestige: shop sub-panel (11 rows, buy buttons, family sections)"
```

---

## Task 10: Run Config sub-panel + seed-driven spawner (§4)

**Files:**
- Modify: `src/scenes/UIScene.ts`
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/game/gameplayState.ts`
- Modify: `src/game/asteroidSpawner.ts`

- [ ] **Step 1: Add `runSeed` to gameplayState**

In `src/game/gameplayState.ts`:

```typescript
private _runSeed = '';
get runSeed(): string { return this._runSeed; }
setRunSeed(seed: string): void { this._runSeed = seed; }
```

Preserve across `resetData()` intentionally — the new seed is set explicitly by Run Config. But `reset()` wipes it.

Also wire into `loadSnapshot`? No — `runSeed` is not part of `GameplaySnapshot`; it's set directly from the save in GameScene `create()`.

- [ ] **Step 2: Make spawner honor seed**

In `src/scenes/GameScene.ts`, where `AsteroidSpawner` is constructed (grep `new AsteroidSpawner`), pass a deterministic seed derived from `runSeed` if present:

```typescript
function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

const seed = gameplayState.runSeed ? seedFromString(gameplayState.runSeed) : undefined;
this.spawner = new AsteroidSpawner(this, seed);
```

For strict determinism across many asteroids, derive a per-asteroid sub-seed (e.g. `seed + spawnCounter`) and pass each to `AsteroidSpawner.spawnOne`. Simpler version: keep spawner's `this.seed` and advance it per-spawn:

Modify `AsteroidSpawner`:
```typescript
export class AsteroidSpawner {
  private counter = 0;
  constructor(private readonly scene: Phaser.Scene, private readonly rootSeed?: number) {}

  spawnOne(worldX: number, worldY: number, params: AsteroidSpawnParams): CompoundAsteroid {
    const seed = this.rootSeed !== undefined
      ? (this.rootSeed ^ (this.counter++ * 0x9e3779b1)) >>> 0 || 1
      : ((Math.random() * 0xffffffff) >>> 0 || 1);
    const rng = new SeededRng(seed);
    // ...rest unchanged...
```

- [ ] **Step 3: Implement `openRunConfig()` in UIScene**

In `src/scenes/UIScene.ts`:

```typescript
private runConfig: Phaser.GameObjects.Container | null = null;
private seedInputEl: HTMLInputElement | null = null;

private openRunConfig(): void {
  if (this.runConfig) return;
  const W = this.scale.width;
  const H = this.scale.height;
  const cx = W / 2;

  const container = this.add.container(0, 0).setDepth(200);
  const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.95).setOrigin(0, 0).setInteractive();
  const title = this.add.text(cx, 200, 'Run Config', { fontSize: '48px', color: '#ffffff' }).setOrigin(0.5);
  const seedLabel = this.add.text(cx, 320, 'Seed:', { fontSize: '28px', color: '#d0d0e0' }).setOrigin(0.5);

  const defaultSeed = `cosmic-dust-${Date.now().toString(36)}`;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultSeed;
  input.style.cssText = 'position:absolute; left:50%; top:380px; transform:translateX(-50%); font-size:24px; padding:8px 16px; width:500px;';
  document.body.appendChild(input);
  this.seedInputEl = input;

  const reroll = this.add.text(cx + 340, 380, '🎲 Re-roll', {
    fontSize: '24px', color: '#ffffff', backgroundColor: '#4a4a5a', padding: { x: 14, y: 8 },
  }).setInteractive({ useHandCursor: true });
  reroll.on('pointerdown', () => {
    if (this.seedInputEl) this.seedInputEl.value = `cosmic-dust-${Date.now().toString(36)}`;
  });

  const start = this.add.text(cx, H - 120, '🚀 Start Run', {
    fontSize: '36px', color: '#ffffff', backgroundColor: '#3a7aff', padding: { x: 30, y: 14 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  container.add([backdrop, title, seedLabel, reroll, start]);
  this.runConfig = container;

  start.on('pointerdown', () => {
    const seed = this.seedInputEl?.value ?? defaultSeed;
    this.closeRunConfig();
    const gs = this.game.scene.getScene('game') as GameScene;
    gs.startNewRun(seed);
  });
}

private closeRunConfig(): void {
  this.runConfig?.destroy();
  this.runConfig = null;
  if (this.seedInputEl) {
    this.seedInputEl.remove();
    this.seedInputEl = null;
  }
}
```

- [ ] **Step 4: Implement `startNewRun(seed)` in GameScene**

In `src/scenes/GameScene.ts`:

```typescript
startNewRun(seed: string): void {
  gameplayState.setRunSeed(seed);
  // Apply starting-cash bonus.
  const params = applyPrestigeEffects(applyUpgrades(gameplayState.levels()), prestigeState.shopLevels());
  gameplayState.addCash(params.startingCash, { silent: true });
  this.persistNow();
  this.scene.restart();
}
```

Since `confirmPrestige` already restarts the scene and lands at the default UI state, `startNewRun` after the shop+config flow is only reached when the user clicks "Start Run" — which means scene is already paused/covered. After `scene.restart()`, GameScene.create consumes the fresh `runSeed` via `gameplayState.runSeed` and seeds the spawner.

- [ ] **Step 5: Typecheck + build**

```bash
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/scenes/UIScene.ts src/scenes/GameScene.ts src/game/gameplayState.ts src/game/asteroidSpawner.ts
git commit -m "prestige: run config sub-panel + seed-driven spawner"
```

---

## Task 11: Playwright smoke extension (§7 success criteria)

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Extend smoke to assert Shards appear on vault kill**

The current smoke runs 30s and asserts saw hits etc. Add a second phase: wait for `pendingShardsThisRun > 0`.

The easiest path: expose `prestigeState` and `pendingShardsThisRun` via a test-only hook on `window` inside `main.ts`:

```typescript
// main.ts
w.__PRESTIGE__ = prestigeState;
```

And on GameScene (already exposes `__GAME__`):
```typescript
// In GameScene create()
(window as unknown as { __PENDING_SHARDS__: () => number }).__PENDING_SHARDS__ = () => this.pendingShardsThisRun;
```

Add to `tests/e2e/smoke.spec.ts`:

```typescript
test('vault cores yield pending shards within 60s', async ({ page }) => {
  await page.goto('/');
  // Wait up to 60s for at least one vault kill (pendingShardsThisRun > 0).
  await page.waitForFunction(() => {
    const w = window as unknown as { __PENDING_SHARDS__?: () => number };
    return (w.__PENDING_SHARDS__?.() ?? 0) > 0;
  }, { timeout: 60000 });
});
```

Note: with default gameplay, a level-0 run may rarely produce vault kills in 60s. Either raise the timeout or set up a deterministic seed via `localStorage` before load:

```typescript
await page.addInitScript(() => {
  // Maximize quality + damage via a synthesized v2 save so a vault dies fast.
  const synthetic = {
    v: 2, cash: 9999, levels: { 'saw.damage': 20, 'asteroids.quality': 8 },
    weaponCounts: { grinder: 1, saw: 4, laser: 2, missile: 2, blackhole: 1 },
    weaponInstances: [], emaCashPerSec: 0, savedAt: Date.now(),
    runSeed: 'smoke-seed', pendingShardsThisRun: 0, prestigeShards: 0,
    prestigeCount: 0, prestigeShopLevels: {}, instancesBoughtThisRun: {},
  };
  localStorage.setItem('asteroid-grinder:save:v2', JSON.stringify(synthetic));
});
```

- [ ] **Step 2: Run the e2e**

```bash
npm run test:e2e
```
Expected: existing smoke tests still pass + new vault-shard test passes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke.spec.ts src/main.ts src/scenes/GameScene.ts
git commit -m "prestige: playwright smoke asserts vault-kill shard accrual"
```

---

## Task 12: Code review pass (required per global preferences)

- [ ] **Step 1: Dispatch a fresh reviewer subagent**

Use the Agent tool with `subagent_type: feature-dev:code-reviewer` (or `superpowers:code-reviewer`). Brief:

> Review the prestige-system implementation on branch `feature/prestige-system` against spec `docs/superpowers/specs/2026-04-16-prestige-system-design.md`. Look for: (1) missing §1 two-bucket behavior (filler roll vs tiered; core bypasses filler); (2) vault HP multiplier not applied to cores; (3) Shard award path — confirm both weapon kills AND grinder kills on cores award Shards; (4) save migration — does a v1 payload round-trip through the app without data loss; (5) free-slot override actually zeros the buy cost; (6) prestige reset wipes weapon instances from the Matter world (scene-restart safety — compound body destroy invariant). Flag high-confidence bugs only. Under 500 words.

- [ ] **Step 2: Address reviewer findings**

For each valid finding, open the file, fix, re-run `npm test && npm run typecheck && npm run build`, commit with message `fix(prestige): <what>`. If a finding is a balance concern (number tuning), add it to §4 of ROADMAP.md instead — gameplay tuning is sacrosanct per CLAUDE.md and the spec flags numbers as placeholders.

---

## Task 13: Docs + verification + FF-merge

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `DESIGN_INVARIANTS.md`

- [ ] **Step 1: Update ROADMAP.md**

Mark the §3 prestige bullet done with today's date (`2026-04-17`). Move the offline-earnings-cap-extender sub-bullet from "open" to "shipped as `offline.cap` prestige upgrade". Leave more-weapons and saw-shape-library as future items.

- [ ] **Step 2: Update README.md**

Add one paragraph under the features list:

```markdown
- **Prestige loop.** Kill vault cores to earn 🔮 Shards. Prestige to bank them,
  wipe your run, and spend in the 11-entry persistent shop: free weapon slots,
  cash/damage multipliers, upgrade discount, Refinement (richer asteroids),
  offline-cap extender, Shard yield, starting cash.
```

- [ ] **Step 3: Update CLAUDE.md**

Bump the test count. Current count was 128; new files add:
- prestigeState: 7 tests
- materials (sampleTieredMaterial): 6 tests
- prestigeAward: 3 tests
- prestigeShopCatalog: 5 tests
- prestigeEffects: 9 tests
- saveState (v2 + migration): 5 new tests
- weaponCatalog (weaponBuyCost): 3 tests

= 128 + 38 = 166 tests across 14 files (adjust if the agent ends up writing slightly different counts — count with `npm test` output).

Replace the line in CLAUDE.md's Tests section with the new numbers.

- [ ] **Step 4: Update DESIGN_INVARIANTS.md**

Add a new section documenting:
- Two-bucket material distribution (filler coin-flip; tiered Gaussian; core bypasses filler)
- Vault HP multiplier (×10 on `isCore` at construction time in CompoundAsteroid)
- Shard banking rule (`pendingShardsThisRun` is lost on run reset without prestige)
- `runSeed` semantics (set at Start Run; preserved across autosave; wiped only by prestige + new seed)
- Save state v2: v1 transparently migrated; new key `asteroid-grinder:save:v2`

- [ ] **Step 5: Final verification**

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```
All pass.

- [ ] **Step 6: Live verification in Chrome**

Start dev server (`npm run dev`), open `http://127.0.0.1:5173` in external Chrome (NOT the preview panel). Verify:
- Bottom bar renders with cash + shards + prestige count.
- Vault core chunks visibly tougher (take multiple saw hits).
- Killing a core increments "🔮 N this run".
- Prestige button → modal opens; confirm resets cash, weapons, upgrades.
- Shop opens after confirm; buying an entry deducts shards and increments level.
- Run Config opens after Next; Start runs a fresh game with the given seed.
- Reload the tab: prestige shop levels and banked shards persist.

Record the session with a screenshot for the commit message proof.

- [ ] **Step 7: Commit docs**

```bash
git add ROADMAP.md README.md CLAUDE.md DESIGN_INVARIANTS.md
git commit -m "docs: prestige system shipped — roadmap, readme, invariants"
```

- [ ] **Step 8: Push + FF-merge to main**

```bash
git push -u origin feature/prestige-system
git checkout main
git pull
git merge --ff-only feature/prestige-system
git push origin main
git branch -d feature/prestige-system
```

- [ ] **Step 9: Post-deploy validation**

GitHub Pages redeploys automatically via `.github/workflows/deploy.yml`. After 2–3 min, open https://muwamath.github.io/asteroid-grinder/ in Chrome, confirm:
- No console errors.
- Bottom bar visible.
- Existing v1 save (if user has one) silently migrated — no data loss.
- Prestige flow clickable end-to-end on the live deploy.

---

## Self-review checklist

**Spec coverage (cross-checked):**
- §1 Material distribution → Task 2 ✅
- §2 Vault cores (HP, shards) → Task 3 ✅
- §3 Prestige state + shop catalog + effects + free-slot → Tasks 1, 4, 5, 6 ✅
- §4 Flow + bottom bar + modal + shop + run config → Tasks 8, 9, 10 ✅
- §5 Save migration → Task 7 ✅
- §6 Implementation order → Tasks roughly match spec order ✅
- §7 Success criteria → Task 11 (Playwright) + Task 13 (live verify) ✅

**Out-of-scope items deliberately skipped:**
- Arena overhaul (separate backlog item added to §3)
- Balance tuning of Shard costs / growth rates (roadmap §4)
- Core visual glow (noted as out of scope for art pass §5 in spec; core still shows via vault HP tank behavior — if Playwright passes without glow, defer glow texture to art pass)

**Core glow callout:** Spec §2 mentions an additive outer glow texture on cores. This plan does NOT implement the glow texture (art pass concern) but DOES make cores visible via 10× HP tanking. If the user considers the glow blocking, add a Task 3.5 to bake `core-${material.name}` canvas textures with a 1.5× halo — reuse existing gem-glow baking code in `GameScene.makeChunkTextures()`.
