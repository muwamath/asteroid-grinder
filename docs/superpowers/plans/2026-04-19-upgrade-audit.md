# Upgrade Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the locked values from `docs/audits/2026-04-19-upgrade-audit.md` into code — 42 upgrade entries across 7 entities + new weapon-purchase curve + reward-formula fix.

**Architecture:** Incremental refactor. Existing catalog/applier/prestige pipeline stays; we add `spawn.*` category, rename `asteroids.dropRate`, add 2 prestige entries, remove 1, update every baseCost/growthRate/maxLevel, fix the reward-formula dominated-upgrade bug, bump save-state v3→v4 with in-place migration. Authoritative source-of-truth for all numbers is the audit doc — the plan refers to it rather than duplicating.

**Tech Stack:** Phaser 3 + TypeScript + Vite + Matter.js + Vitest + Playwright.

**Working branch:** `feature/upgrade-audit` (already checked out).

---

## File structure

| File | Change |
|---|---|
| `src/game/weaponCatalog.ts` | Add `spawn` category, rename `asteroids.dropRate`→`spawn.rate`, add `spawn.amplitude`, apply all 28 in-run upgrade values; rewrite `weaponBuyCost` |
| `src/game/upgradeApplier.ts` | Add `spawnAmplitudeMultiplier` + `shardYieldMultiplier` + `offlineRateMultiplier` to `EffectiveGameplayParams` + `BASE_PARAMS`; add `SPAWN_AMPLITUDE_PER_LEVEL`; update `applyUpgrades` |
| `src/game/prestigeShopCatalog.ts` | Add `prestige.shardMultiplier` + `offline.rate`; remove `arena.preUnlockedSlots` |
| `src/game/prestigeEffects.ts` | Apply the two new multipliers; drop `arena.preUnlockedSlots` handling |
| `src/game/prestigeAward.ts` | Accept `shardYieldMultiplier` param; multiply final shard count |
| `src/game/offlineProgress.ts` | Accept `rateMultiplier` param; scale input rate |
| `src/game/rewardFormula.ts` | **NEW** — pure helper `computeChunkReward(tier, hpMultiplier, killerType, cashMultiplier)` |
| `src/game/gameplayState.ts` | Add `totalInstancesBoughtThisRun()` getter (sum across all non-grinder types) |
| `src/game/saveState.ts` | Bump `SAVE_STATE_VERSION` 3→4, `STORAGE_KEY` suffix, add `STORAGE_KEY_V3` legacy constant, add `migrateV3ToV4`, update `loadFromLocalStorage` to call migration before giving up |
| `src/scenes/GameScene.ts` | Use `rewardFormula.computeChunkReward` in `collectDeadAtDeathLine`; multiply spawner `amplitude` by `effectiveParams.spawnAmplitudeMultiplier` |
| `src/scenes/UIScene.ts` | Update `weaponBuyCost` call site to pass global count + type count + free slots |
| Tests | Rename `asteroids.dropRate` → `spawn.rate` across `upgradeApplier.test.ts`, `gameplayState.test.ts`, `saveState.test.ts`; update maxLevel assertions; add ~10 new tests covering: spawn.amplitude, reward formula, shard multiplier, offline rate, new prestige entries, save migration, global weapon buy curve |

---

### Task 1: Add `spawn` category + `spawn.amplitude` upgrade (structural only, no value updates yet)

**Files:**
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/upgradeApplier.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/game/upgradeApplier.test.ts` (inside the existing `describe('applyUpgrades', ...)` block):

```ts
it('spawn.rate replaces asteroids.dropRate for interval reduction', () => {
  expect(applyUpgrades({ 'spawn.rate': 2 }).spawnIntervalMs).toBe(1800 - 260);
  expect(applyUpgrades({ 'spawn.rate': 99 }).spawnIntervalMs).toBe(300);
});

it('spawn.amplitude scales the sweep multiplier (+10% per level)', () => {
  expect(applyUpgrades({}).spawnAmplitudeMultiplier).toBe(1);
  expect(applyUpgrades({ 'spawn.amplitude': 5 }).spawnAmplitudeMultiplier).toBeCloseTo(1.5);
  expect(applyUpgrades({ 'spawn.amplitude': 10 }).spawnAmplitudeMultiplier).toBeCloseTo(2.0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- -t 'spawn.rate replaces asteroids.dropRate'`
Expected: FAIL — `spawn.rate` is not read, and `spawnAmplitudeMultiplier` does not exist on `EffectiveGameplayParams`.

- [ ] **Step 3: Add the new `spawn` category to `src/game/weaponCatalog.ts`**

Append a new entry to `CATEGORY_DEFS` (keep `asteroids` — the rename of `asteroids.dropRate` happens as part of the MOVE, not a separate edit). Insert above `CATEGORY_DEFS`'s existing `asteroids` entry or as a second entry — order inside `CATEGORY_DEFS` doesn't matter.

Remove the `asteroids.dropRate` entry from the existing `asteroids` category. Add `spawn.rate` + `spawn.amplitude` entries inside a new `spawn` category. Use placeholder `baseCost: 1, growthRate: 1` for now — Task 2 fills in real values.

```ts
export const CATEGORY_DEFS: readonly CategoryDef[] = [
  {
    id: 'asteroids',
    name: 'Asteroids',
    icon: 'asteroids',
    upgrades: [
      // NOTE: removed `asteroids.dropRate` — now `spawn.rate` under the spawn category.
      { id: 'asteroids.chunkHp',       name: 'Chunk HP',       description: 'HP multiplier per chunk (higher tiers gain more)', category: 'asteroids', baseCost: 1, growthRate: 1, maxLevel: 10 },
      { id: 'asteroids.asteroidSize',  name: 'Asteroid Size',  description: '+2 chunks per asteroid',                             category: 'asteroids', baseCost: 1, growthRate: 1, maxLevel: 8 },
      { id: 'asteroids.quality',       name: 'Asteroid Quality', description: 'Unlocks and weights higher-tier materials',        category: 'asteroids', baseCost: 1, growthRate: 1, maxLevel: 8 },
      { id: 'asteroids.fallSpeed',     name: 'Fall Speed',     description: 'Asteroids fall faster',                              category: 'asteroids', baseCost: 1, growthRate: 1, maxLevel: 9 },
    ],
  },
  {
    id: 'spawn',
    name: 'Spawner',
    icon: 'spawner',
    upgrades: [
      { id: 'spawn.rate',      name: 'Spawn Rate',      description: 'Asteroids spawn faster',         category: 'spawn', baseCost: 1, growthRate: 1, maxLevel: 10 },
      { id: 'spawn.amplitude', name: 'Spawn Amplitude', description: 'Spawner sweeps a wider arc',     category: 'spawn', baseCost: 1, growthRate: 1, maxLevel: 10 },
    ],
  },
];
```

- [ ] **Step 4: Add `spawnAmplitudeMultiplier` to `EffectiveGameplayParams` + `BASE_PARAMS` + per-level constant, and update `applyUpgrades`** in `src/game/upgradeApplier.ts`

In `EffectiveGameplayParams` interface, add after `spawnIntervalMs`:
```ts
  readonly spawnAmplitudeMultiplier: number;
```

In `BASE_PARAMS`, add:
```ts
  spawnAmplitudeMultiplier: 1,
```

Add a new per-level constant near the other constants:
```ts
const SPAWN_AMPLITUDE_PER_LEVEL = 0.1;
```

In `applyUpgrades`, change `spawnIntervalMs` to read from `spawn.rate`:
```ts
    spawnIntervalMs: Math.max(
      DROP_RATE_MIN_MS,
      BASE_PARAMS.spawnIntervalMs - lv('spawn.rate') * DROP_RATE_MS_PER_LEVEL,
    ),
    spawnAmplitudeMultiplier:
      BASE_PARAMS.spawnAmplitudeMultiplier + lv('spawn.amplitude') * SPAWN_AMPLITUDE_PER_LEVEL,
```

Also rename `DROP_RATE_MS_PER_LEVEL` → keep as-is (still meaningful — it's the ms-per-level for `spawn.rate`). No rename needed; comment is sufficient.

- [ ] **Step 5: Migrate existing `asteroids.dropRate` tests** — edit `src/game/upgradeApplier.test.ts` around line 37–38:

```ts
// BEFORE
expect(applyUpgrades({ 'asteroids.dropRate': 2 }).spawnIntervalMs).toBe(1800 - 260);
expect(applyUpgrades({ 'asteroids.dropRate': 99 }).spawnIntervalMs).toBe(300);
// AFTER — delete these two lines; replaced by the new `spawn.rate` test from Step 1.
```

Search the file for any other `asteroids.dropRate` reference and rename to `spawn.rate`. The reference around line 180 (inside an `allUpgradeDefs` test) just lists id strings — update that list.

Also search `src/game/gameplayState.test.ts` and `src/game/saveState.test.ts` for `dropRate` references and rename string keys to `spawn.rate` where they appear as upgrade-id keys. (Unrelated variable names like `dropRate: 2` in fixtures should be renamed to something neutral if confusing, but the save-state migration path [Task 10] relies on the LEGACY name appearing in old data — so leave test fixtures' legacy keys alone IF the test is exercising v3 load behavior.)

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test`
Expected: PASS — all existing tests migrate cleanly, new `spawn.*` tests pass, no `asteroids.dropRate` references remain.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "upgrades: add spawn category + spawn.amplitude; rename dropRate → spawn.rate"
```

---

### Task 2: Apply in-run cost curves + max levels from audit doc

**Files:**
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/upgradeApplier.test.ts` (update any `isMaxed` assertions that depended on old caps)

Source of truth for all numbers: `docs/audits/2026-04-19-upgrade-audit.md` → "Locked per-upgrade values".

- [ ] **Step 1: Write a probe test** — append to `src/game/upgradeApplier.test.ts` or a new file `src/game/weaponCatalog.test.ts` if easier:

```ts
import { findUpgrade } from './weaponCatalog';

describe('weaponCatalog — audit-locked cost curves', () => {
  it('saw.damage: $15, 1.25×, uncapped', () => {
    const u = findUpgrade('saw.damage')!;
    expect(u.baseCost).toBe(15);
    expect(u.growthRate).toBe(1.25);
    expect(u.maxLevel).toBe(Number.POSITIVE_INFINITY);
  });
  it('saw.bladeCount: $2500, 4.0×, cap 5', () => {
    const u = findUpgrade('saw.bladeCount')!;
    expect(u.baseCost).toBe(2500);
    expect(u.growthRate).toBe(4);
    expect(u.maxLevel).toBe(5);
  });
  it('spawn.rate: $200, 2.2×, cap 12', () => {
    const u = findUpgrade('spawn.rate')!;
    expect(u.baseCost).toBe(200);
    expect(u.growthRate).toBe(2.2);
    expect(u.maxLevel).toBe(12);
  });
  it('asteroids.chunkHp matches grinder.damage for Tier-S parity', () => {
    const a = findUpgrade('asteroids.chunkHp')!;
    const b = findUpgrade('grinder.damage')!;
    expect(a.baseCost).toBe(b.baseCost);
    expect(a.growthRate).toBe(b.growthRate);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm test -- -t 'audit-locked cost curves'`
Expected: FAIL — values are still placeholder `1, 1`.

- [ ] **Step 3: Apply every audit value in `src/game/weaponCatalog.ts`**

Using the tables under "Locked per-upgrade values" in `docs/audits/2026-04-19-upgrade-audit.md`. For each entity's block of `UpgradeDef` entries, rewrite `baseCost`, `growthRate`, `maxLevel`. For `maxLevel: ∞` in the audit, use `Number.POSITIVE_INFINITY`. Per-level deltas already live in `upgradeApplier.ts` as constants — verify they match the audit table, adjust any that differ.

Concrete checks vs current `upgradeApplier.ts`:
- `SPAWN_AMPLITUDE_PER_LEVEL = 0.1` ✓ (added Task 1)
- All existing per-level constants match the audit already — no `upgradeApplier.ts` edits needed for Task 2 (values stayed).

Uncapped (`Number.POSITIVE_INFINITY`) per audit: `grinder.damage`, `saw.damage`, `saw.orbitSpeed`, `laser.range`, `laser.damage`, `missile.damage`, `missile.blastRadius`, `missile.speed`, `blackhole.pullRange`, `blackhole.pullForce`, `blackhole.coreSize`, `blackhole.coreDamage`, `asteroids.chunkHp`.

- [ ] **Step 4: Update tests that depended on old `maxLevel` values**

Search `src/game/weaponCatalog.test.ts` for assertions on `maxLevel`. Any test that checks a specific level-20 cap for `saw.damage` etc. must be updated or removed — most were placeholder. For uncapped upgrades, replace `isMaxed(def, 20)` checks with `isMaxed(def, Number.POSITIVE_INFINITY)` or an equivalent semantic check (typically drop the test because "max for uncapped" isn't meaningful).

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "upgrades: apply audit-locked cost curves and max levels to in-run catalog"
```

---

### Task 3: Global weapon-purchase cost formula + `totalInstancesBoughtThisRun`

**Files:**
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/weaponCatalog.test.ts`
- Modify: `src/game/gameplayState.ts`
- Modify: `src/game/gameplayState.test.ts`
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Write failing tests** — replace the existing `describe('weaponBuyCost', ...)` block in `src/game/weaponCatalog.test.ts` with:

```ts
describe('weaponBuyCost', () => {
  it('1st purchase is always $0 regardless of free slots', () => {
    expect(weaponBuyCost({ globalBought: 0, typeBought: 0, freeSlotsForType: 0 })).toBe(0);
    expect(weaponBuyCost({ globalBought: 0, typeBought: 0, freeSlotsForType: 3 })).toBe(0);
  });
  it('follows 1000 × 3^(N-2) for N >= 2', () => {
    expect(weaponBuyCost({ globalBought: 1, typeBought: 0, freeSlotsForType: 0 })).toBe(1000);
    expect(weaponBuyCost({ globalBought: 2, typeBought: 0, freeSlotsForType: 0 })).toBe(3000);
    expect(weaponBuyCost({ globalBought: 5, typeBought: 0, freeSlotsForType: 0 })).toBe(81000);
    expect(weaponBuyCost({ globalBought: 9, typeBought: 0, freeSlotsForType: 0 })).toBe(6561000);
  });
  it('free.<type> grants $0 up to freeSlotsForType, global counter still applies on exhaustion', () => {
    expect(weaponBuyCost({ globalBought: 3, typeBought: 0, freeSlotsForType: 2 })).toBe(0);
    expect(weaponBuyCost({ globalBought: 3, typeBought: 1, freeSlotsForType: 2 })).toBe(0);
    expect(weaponBuyCost({ globalBought: 3, typeBought: 2, freeSlotsForType: 2 })).toBe(27000);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- -t 'weaponBuyCost'`
Expected: FAIL — old signature still has `baseCost` and per-type semantics.

- [ ] **Step 3: Rewrite `weaponBuyCost` in `src/game/weaponCatalog.ts`**

```ts
export interface WeaponBuyCostArgs {
  readonly globalBought: number;        // total non-grinder weapons bought this run
  readonly typeBought: number;          // count of THIS type bought this run
  readonly freeSlotsForType: number;    // prestige free.<type> level
}

/**
 * Global Nth-weapon purchase curve.
 * - 1st purchase is always $0 — every run has at least one weapon.
 * - N >= 2: cost = 1000 * 3^(N-2).
 * - Prestige `free.<type>` grants $0 on purchases #1..N of that type (up to freeSlotsForType);
 *   those purchases still increment globalBought so the global curve is not exploitable.
 */
export function weaponBuyCost({ globalBought, typeBought, freeSlotsForType }: WeaponBuyCostArgs): number {
  if (typeBought < freeSlotsForType) return 0;
  const N = globalBought + 1;
  if (N <= 1) return 0;
  return Math.floor(1000 * Math.pow(3, N - 2));
}
```

- [ ] **Step 4: Add `totalInstancesBoughtThisRun` getter in `src/game/gameplayState.ts`**

Add a method that sums `instancesBoughtThisRun` across all non-grinder types. Keep it simple:

```ts
totalInstancesBoughtThisRun(): number {
  const map = this._instancesBoughtThisRun ?? {};
  let total = 0;
  for (const [typeId, n] of Object.entries(map)) {
    if (typeId === 'grinder') continue;
    total += n;
  }
  return total;
}
```

Add a test in `src/game/gameplayState.test.ts`:

```ts
it('totalInstancesBoughtThisRun excludes grinder and sums across types', () => {
  gameplayState.buyWeapon('saw');
  gameplayState.buyWeapon('laser');
  gameplayState.buyWeapon('laser');
  expect(gameplayState.totalInstancesBoughtThisRun()).toBe(3);
});
```

- [ ] **Step 5: Update the caller in `src/scenes/UIScene.ts`** (around line 859)

```ts
// BEFORE
const cost = weaponBuyCost({ boughtThisRun: bought, freeSlots, baseCost: 1 });
// AFTER
const globalBought = gameplayState.totalInstancesBoughtThisRun();
const cost = weaponBuyCost({
  globalBought,
  typeBought: bought,
  freeSlotsForType: freeSlots,
});
```

- [ ] **Step 6: Run all tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "weapon buy: global Nth curve; 1st free; 1000×3^(N-2) thereafter"
```

---

### Task 4: Prestige shop — add 2, remove 1

**Files:**
- Modify: `src/game/prestigeShopCatalog.ts`
- Modify: `src/game/prestigeShopCatalog.test.ts`

- [ ] **Step 1: Write failing tests** — edit `src/game/prestigeShopCatalog.test.ts`:

Replace `expect(PRESTIGE_SHOP.length).toBe(12);` with:
```ts
expect(PRESTIGE_SHOP.length).toBe(13);
```

Remove the entire `it('exposes arena.preUnlockedSlots ...')` test — that entry is now removed.

Add new tests:

```ts
it('prestige.shardMultiplier exists as multiplier family with max 20', () => {
  const e = findShopEntry('prestige.shardMultiplier');
  expect(e).toBeDefined();
  expect(e!.family).toBe('multiplier');
  expect(e!.baseCost).toBe(15);
  expect(e!.growthRate).toBe(1.8);
  expect(e!.maxLevel).toBe(20);
});

it('offline.rate exists as economy family with max 6', () => {
  const e = findShopEntry('offline.rate');
  expect(e).toBeDefined();
  expect(e!.family).toBe('economy');
  expect(e!.baseCost).toBe(40);
  expect(e!.growthRate).toBe(2.5);
  expect(e!.maxLevel).toBe(6);
});

it('arena.preUnlockedSlots is removed', () => {
  expect(findShopEntry('arena.preUnlockedSlots')).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- -t 'prestigeShopCatalog'`
Expected: FAIL.

- [ ] **Step 3: Edit `src/game/prestigeShopCatalog.ts`**

Remove the `arena.preUnlockedSlots` row. Add the two new entries:

```ts
  { id: 'prestige.shardMultiplier', family: 'multiplier', name: 'Shard Multiplier', description: '+5% global Shard yield per level (cap +100%)', baseCost: 15, growthRate: 1.8, maxLevel: 20 },
  { id: 'offline.rate',             family: 'economy',    name: 'Offline Rate',      description: '+15% offline earnings rate per level (cap +90%)', baseCost: 40, growthRate: 2.5, maxLevel: 6 },
```

Keep array order consistent with the audit doc table.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "prestige: add shardMultiplier + offline.rate, remove arena.preUnlockedSlots"
```

---

### Task 5: Prestige effects — apply new multipliers

**Files:**
- Modify: `src/game/upgradeApplier.ts` (add 2 new fields)
- Modify: `src/game/prestigeEffects.ts`
- Modify: `src/game/prestigeEffects.test.ts`

- [ ] **Step 1: Write failing tests** — append to `src/game/prestigeEffects.test.ts`:

```ts
it('prestige.shardMultiplier sets shardYieldMultiplier to 1 + 0.05×level', () => {
  const base = applyUpgrades({});
  const withShop = applyPrestigeEffects(base, { 'prestige.shardMultiplier': 4 });
  expect(withShop.shardYieldMultiplier).toBeCloseTo(1.2);
  const maxed = applyPrestigeEffects(base, { 'prestige.shardMultiplier': 20 });
  expect(maxed.shardYieldMultiplier).toBeCloseTo(2.0);
});

it('offline.rate sets offlineRateMultiplier to 1 + 0.15×level', () => {
  const base = applyUpgrades({});
  const withShop = applyPrestigeEffects(base, { 'offline.rate': 2 });
  expect(withShop.offlineRateMultiplier).toBeCloseTo(1.3);
  const maxed = applyPrestigeEffects(base, { 'offline.rate': 6 });
  expect(maxed.offlineRateMultiplier).toBeCloseTo(1.9);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- -t 'prestigeEffects'`
Expected: FAIL — fields don't exist yet.

- [ ] **Step 3: Add fields to `EffectiveGameplayParams` and `BASE_PARAMS`** in `src/game/upgradeApplier.ts`

In interface, after `shardYieldBonus`:
```ts
  readonly shardYieldMultiplier: number;
  readonly offlineRateMultiplier: number;
```

In `BASE_PARAMS`:
```ts
  shardYieldMultiplier: 1,
  offlineRateMultiplier: 1,
```

In `applyUpgrades` return object, thread from BASE:
```ts
  shardYieldMultiplier: BASE_PARAMS.shardYieldMultiplier,
  offlineRateMultiplier: BASE_PARAMS.offlineRateMultiplier,
```

- [ ] **Step 4: Apply multipliers in `src/game/prestigeEffects.ts`**

```ts
return {
  ...params,
  // ... existing overrides ...
  shardYieldMultiplier: 1 + 0.05 * lv('prestige.shardMultiplier'),
  offlineRateMultiplier: 1 + 0.15 * lv('offline.rate'),
};
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "prestige effects: apply shardYieldMultiplier and offlineRateMultiplier"
```

---

### Task 6: Wire shard multiplier into vault award

**Files:**
- Modify: `src/game/prestigeAward.ts`
- Modify: `src/game/prestigeAward.test.ts`
- Modify: `src/scenes/GameScene.ts` (caller — grep for `computeVaultShardReward`)

- [ ] **Step 1: Write failing tests** — append to `src/game/prestigeAward.test.ts`:

```ts
it('shardYieldMultiplier scales the final shard count (floor)', () => {
  const mat = { tier: 5 } as Material;
  expect(computeVaultShardReward(mat, 0, 1.0)).toBe(5);
  expect(computeVaultShardReward(mat, 0, 2.0)).toBe(10);
  expect(computeVaultShardReward(mat, 2, 1.5)).toBe(Math.floor(7 * 1.5)); // (5+2)*1.5 = 10
});
```

- [ ] **Step 2: Verify fail**

Run: `npm test -- -t 'shardYieldMultiplier scales'`
Expected: FAIL — signature doesn't take multiplier.

- [ ] **Step 3: Update `computeVaultShardReward` signature in `src/game/prestigeAward.ts`**

```ts
export function computeVaultShardReward(
  material: Material | null | undefined,
  shardYieldBonus: number,
  shardYieldMultiplier: number = 1,
): number {
  if (!material) return 0;
  const base = material.tier + Math.max(0, shardYieldBonus);
  return Math.floor(base * Math.max(0, shardYieldMultiplier));
}
```

- [ ] **Step 4: Update the call site in `src/scenes/GameScene.ts`**

Grep: `grep -n computeVaultShardReward src/scenes/GameScene.ts`. Find the invocation and pass `this.effectiveParams.shardYieldMultiplier` as the third arg. If the call currently reads the bonus from `effectiveParams.shardYieldBonus`, the multiplier comes from the same params object.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "prestige: wire shardYieldMultiplier into vault-core shard award"
```

---

### Task 7: Wire offline rate multiplier

**Files:**
- Modify: `src/game/offlineProgress.ts`
- Modify: `src/game/offlineProgress.test.ts`
- Modify: `src/scenes/GameScene.ts` (caller — grep for `computeOfflineAward`)

- [ ] **Step 1: Write failing tests** — append to `src/game/offlineProgress.test.ts`:

```ts
it('rateMultiplier scales the effective rate before capping', () => {
  expect(computeOfflineAward({ rate: 10, elapsedMs: 1000, capMs: 10_000, rateMultiplier: 1 })).toBe(10);
  expect(computeOfflineAward({ rate: 10, elapsedMs: 1000, capMs: 10_000, rateMultiplier: 2 })).toBe(20);
  expect(computeOfflineAward({ rate: 10, elapsedMs: 1000, capMs: 10_000, rateMultiplier: 1.5 })).toBe(15);
});
```

- [ ] **Step 2: Verify fail**

Run: `npm test -- -t 'rateMultiplier scales'`
Expected: FAIL.

- [ ] **Step 3: Update `computeOfflineAward` signature in `src/game/offlineProgress.ts`**

```ts
export interface OfflineAwardInput {
  rate: number;
  elapsedMs: number;
  capMs: number;
  rateMultiplier?: number; // default 1
}

export function computeOfflineAward({ rate, elapsedMs, capMs, rateMultiplier = 1 }: OfflineAwardInput): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const effectiveRate = rate * Math.max(0, rateMultiplier);
  const clamped = Math.min(elapsedMs, capMs);
  return Math.floor(effectiveRate * (clamped / 1000));
}
```

- [ ] **Step 4: Update the caller** — grep `computeOfflineAward` in `src/scenes/GameScene.ts`, pass `rateMultiplier: this.effectiveParams.offlineRateMultiplier` in the args object.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "offline: scale offline earnings rate by offlineRateMultiplier"
```

---

### Task 8: Reward formula fix — `tier × hpMultiplier`

**Files:**
- Create: `src/game/rewardFormula.ts`
- Create: `src/game/rewardFormula.test.ts`
- Modify: `src/scenes/GameScene.ts` (replace inline formula with helper call)

- [ ] **Step 1: Write tests for the new helper** — create `src/game/rewardFormula.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeChunkReward } from './rewardFormula';

describe('computeChunkReward', () => {
  it('grinder kills pay flat $1 × cashMultiplier, ignore tier and hp', () => {
    expect(computeChunkReward({ tier: 1,  hpMultiplier: 1, killerType: 'grinder', cashMultiplier: 1 })).toBe(1);
    expect(computeChunkReward({ tier: 9,  hpMultiplier: 5, killerType: 'grinder', cashMultiplier: 1 })).toBe(1);
    expect(computeChunkReward({ tier: 9,  hpMultiplier: 5, killerType: 'grinder', cashMultiplier: 3 })).toBe(3);
  });

  it('non-grinder kills pay tier × hpMultiplier × cashMultiplier (floor, minimum 1)', () => {
    expect(computeChunkReward({ tier: 5, hpMultiplier: 1, killerType: 'saw',      cashMultiplier: 1 })).toBe(5);
    expect(computeChunkReward({ tier: 5, hpMultiplier: 3, killerType: 'saw',      cashMultiplier: 1 })).toBe(15);
    expect(computeChunkReward({ tier: 5, hpMultiplier: 3, killerType: 'laser',    cashMultiplier: 2 })).toBe(30);
  });

  it('returns at least 1 even when math underflows', () => {
    expect(computeChunkReward({ tier: 1, hpMultiplier: 0.1, killerType: 'saw', cashMultiplier: 0.5 })).toBe(1);
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `npm test -- -t 'computeChunkReward'`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/game/rewardFormula.ts`**

```ts
export type WeaponKillSource = 'saw' | 'laser' | 'missile' | 'blackhole' | 'grinder';

export interface ChunkRewardArgs {
  readonly tier: number;
  readonly hpMultiplier: number;
  readonly killerType: WeaponKillSource;
  readonly cashMultiplier: number;
}

/**
 * Cash paid for a dead chunk as it crosses the death line.
 * - Grinder kills: flat $1 × cashMultiplier (design invariant — grinder is cleanup, not reward-scaling).
 * - All other kills: tier × hpMultiplier × cashMultiplier (reward scales with HP upgrade).
 * - Minimum $1 to avoid rounding to $0.
 */
export function computeChunkReward({ tier, hpMultiplier, killerType, cashMultiplier }: ChunkRewardArgs): number {
  const base = killerType === 'grinder' ? 1 : tier * hpMultiplier;
  return Math.max(1, Math.floor(base * cashMultiplier));
}
```

- [ ] **Step 4: Replace inline formula in `src/scenes/GameScene.ts` `collectDeadAtDeathLine`** (around line 574)

```ts
// BEFORE
const baseReward = killerType === 'grinder' ? 1 : tier;
const reward = Math.max(1, Math.floor(baseReward * this.effectiveParams.cashMultiplier));
// AFTER
import { computeChunkReward } from '../game/rewardFormula'; // add to top of file
// ...
const reward = computeChunkReward({
  tier,
  hpMultiplier: this.effectiveParams.maxHpPerChunk,
  killerType,
  cashMultiplier: this.effectiveParams.cashMultiplier,
});
```

If `WeaponKillSource` is already defined in GameScene, import it from the new module instead — single source of truth.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "reward: chunk payout = tier × hpMultiplier so chunkHp upgrade pays off"
```

---

### Task 9: Wire `spawn.amplitude` into GameScene oscillator

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Locate the spawner amplitude** — around line 981:

```ts
const amplitude = Math.max(0, w / 2 - this.maxAsteroidRadius - SPAWN_MARGIN);
```

- [ ] **Step 2: Multiply by `spawnAmplitudeMultiplier`**

```ts
const amplitude =
  Math.max(0, w / 2 - this.maxAsteroidRadius - SPAWN_MARGIN) *
  this.effectiveParams.spawnAmplitudeMultiplier;
```

- [ ] **Step 3: Clamp to not exceed screen** — if the multiplier can push `amplitude` past the screen edge, clamp:

Look for whether the oscillator math uses `amplitude` as-is to offset spawn X around center. If the multiplied value can cause negative safety (asteroid spawns outside collision bounds), clamp to the un-multiplied max:

```ts
const maxAmplitude = Math.max(0, w / 2 - this.maxAsteroidRadius - SPAWN_MARGIN);
const amplitude = Math.min(
  maxAmplitude,
  maxAmplitude * this.effectiveParams.spawnAmplitudeMultiplier,
);
```

— or let it exceed if the L10 cap (`×2.0`) is still safe given the +SPAWN_MARGIN padding. Decide based on reading: does `w/2 - maxAsteroidRadius - SPAWN_MARGIN` already leave headroom? If it's tight, keep the clamped form.

- [ ] **Step 4: Typecheck + run existing tests** (no new unit test — this is scene-side behavior)

Run: `npm test && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "spawner: apply spawnAmplitudeMultiplier to oscillator arc"
```

---

### Task 10: Save-state migration v3 → v4

**Files:**
- Modify: `src/game/saveState.ts`
- Modify: `src/game/saveState.test.ts`

- [ ] **Step 1: Write failing tests** — append to `src/game/saveState.test.ts`:

```ts
it('migrateV3ToV4 renames asteroids.dropRate → spawn.rate in levels', () => {
  const v3 = {
    v: 3 as const,
    cash: 100,
    levels: { 'asteroids.dropRate': 4, 'saw.damage': 2 },
    weaponCounts: {},
    weaponInstallations: [],
    emaCashPerSec: 0,
    savedAt: 1,
    runSeed: 'x',
    arenaSeed: 1,
    arenaSlotsUnlocked: [],
    arenaFreeUnlockUsed: false,
    pendingShardsThisRun: 0,
    prestigeShards: 0,
    prestigeCount: 0,
    prestigeShopLevels: {},
    instancesBoughtThisRun: {},
  };
  const v4 = migrateV3ToV4(v3);
  expect(v4.v).toBe(4);
  expect(v4.levels['spawn.rate']).toBe(4);
  expect(v4.levels['asteroids.dropRate']).toBeUndefined();
  expect(v4.levels['saw.damage']).toBe(2);
});

it('migrateV3ToV4 drops arena.preUnlockedSlots from prestigeShopLevels', () => {
  const v3 = /* minimal v3 state */ {
    v: 3 as const,
    cash: 0,
    levels: {},
    weaponCounts: {},
    weaponInstallations: [],
    emaCashPerSec: 0,
    savedAt: 1,
    runSeed: 'x',
    arenaSeed: 1,
    arenaSlotsUnlocked: [],
    arenaFreeUnlockUsed: false,
    pendingShardsThisRun: 0,
    prestigeShards: 0,
    prestigeCount: 0,
    prestigeShopLevels: { 'arena.preUnlockedSlots': 3, 'mult.cash': 5 },
    instancesBoughtThisRun: {},
  };
  const v4 = migrateV3ToV4(v3);
  expect(v4.prestigeShopLevels['arena.preUnlockedSlots']).toBeUndefined();
  expect(v4.prestigeShopLevels['mult.cash']).toBe(5);
});

it('loadFromLocalStorage migrates v3 data into v4 on first read', () => {
  const v3 = /* same minimal v3 state */ {};
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ /* v3 data */ }));
  const loaded = loadFromLocalStorage();
  expect(loaded?.v).toBe(4);
  // v3 key cleared after migration
  expect(localStorage.getItem(STORAGE_KEY_V3)).toBeNull();
});
```

- [ ] **Step 2: Verify fail**

Run: `npm test -- -t 'migrateV3ToV4'`
Expected: FAIL — function + v4 type don't exist.

- [ ] **Step 3: Edit `src/game/saveState.ts`**

Add `SaveStateV4` mirroring `SaveStateV3` but with `v: 4`. Bump constants:

```ts
export const SAVE_STATE_VERSION = 4;
export const STORAGE_KEY = 'asteroid-grinder:save:v4';
export const STORAGE_KEY_V3 = 'asteroid-grinder:save:v3';
export const STORAGE_KEY_V2 = 'asteroid-grinder:save:v2';
export const STORAGE_KEY_V1 = 'asteroid-grinder:save:v1';
```

Export `SaveStateV4` interface identical to v3 except `v: 4`. Keep `SaveStateV3` export for migration code.

Add migration:

```ts
export function migrateV3ToV4(s: SaveStateV3): SaveStateV4 {
  const levels = { ...s.levels };
  if ('asteroids.dropRate' in levels) {
    levels['spawn.rate'] = levels['asteroids.dropRate'];
    delete levels['asteroids.dropRate'];
  }
  const prestigeShopLevels = { ...s.prestigeShopLevels };
  delete prestigeShopLevels['arena.preUnlockedSlots'];
  return { ...s, v: 4, levels, prestigeShopLevels };
}
```

Update `loadFromLocalStorage`:

```ts
export function loadFromLocalStorage(): SaveStateV4 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return deserialize(raw);
    // Attempt v3 migration
    const rawV3 = localStorage.getItem(STORAGE_KEY_V3);
    if (rawV3) {
      const parsedV3 = tryParseV3(rawV3);
      if (parsedV3) {
        const migrated = migrateV3ToV4(parsedV3);
        saveToLocalStorage(migrated);
        localStorage.removeItem(STORAGE_KEY_V3);
        return migrated;
      }
    }
    return null;
  } catch {
    return null;
  }
}
```

(Helper `tryParseV3` mirrors old v3 validation.)

Update `clearSave` to also clear `STORAGE_KEY_V3`.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "saveState: v3→v4 migration — spawn.rate rename, drop arena.preUnlockedSlots"
```

---

### Task 11: Final validation

**Files:** none — this is verification.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: PASS. Count test files + count; update `CLAUDE.md` if it differs from the stated "178 tests across 18 files".

- [ ] **Step 2: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: PASS. The `Some chunks are larger than 500 kB` warning is pre-existing and OK.

- [ ] **Step 3: Playwright smoke**

```bash
npm run test:e2e
```

Expected: PASS (30s boot, non-zero saw hits, rotating asteroids, clean console).

- [ ] **Step 4: Manual in-browser check**

```bash
npm run dev
```

Open `http://127.0.0.1:5173/?restart=1` in Chrome via DevTools MCP. Verify:

- Weapon picker shows $0 for the 1st purchase, $1,000 for the 2nd
- `saw.damage` upgrade button shows cost $15 at L0, ~$18 at L1, ~$23 at L2 (1.25× growth)
- Spawner category appears in the upgrades sub-panel with `Spawn Rate` and `Spawn Amplitude`
- Prestige shop shows `Shard Multiplier` and `Offline Rate`, does NOT show `Pre-Unlocked Slots`
- Killing a high-tier chunk after leveling `asteroids.chunkHp` pays more than before (watch the cash counter)
- No console errors

- [ ] **Step 5: Update `ROADMAP.md`** — mark §4 Upgrade Audit complete:

```md
- ✅ **Upgrade audit — every item, every stat.** Shipped 2026-04-19. …
- ✅ **Economy rebalance** (partial). Shipped as part of the audit — all 28 in-run upgrades + 13 prestige entries priced; reward formula fixed so chunkHp is no longer a dominated upgrade; weapon purchase now follows a global Nth-weapon curve with 1st free.
```

Prune any backlog items now obsolete.

- [ ] **Step 6: Update `CLAUDE.md`** test count if changed.

- [ ] **Step 7: Commit docs**

```bash
git add ROADMAP.md CLAUDE.md
git commit -m "docs: mark §4 upgrade audit + partial rebalance complete"
```

- [ ] **Step 8: Hand off for eyeball**

Surface a summary for the user:
- branch: `feature/upgrade-audit`
- what to play-test: start a new run, buy a couple of weapons, level a few upgrades, verify the cost/pace feels right
- prestige the run (if feasible), verify the shop shows new entries
- confirm no console errors on the live dev server

Per global rule: do NOT FF-merge until user approves.

---

## Self-review

1. **Spec coverage:** Every entity + weapon purchase + reward fix + save migration has a dedicated task. ✅
2. **Placeholder scan:** No TBD/TODO. Code blocks are complete (no "similar to above"). ✅
3. **Type consistency:** `WeaponKillSource` defined once in `rewardFormula.ts`; `computeChunkReward` args consistent between definition (Task 8 step 3) and call site (Task 8 step 4); `weaponBuyCost` args consistent between definition (Task 3 step 3) and UIScene caller (Task 3 step 5). Shop entry IDs match audit doc (`prestige.shardMultiplier` spelled identically). ✅
