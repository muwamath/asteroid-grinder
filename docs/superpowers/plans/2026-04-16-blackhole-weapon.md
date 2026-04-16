# Black Hole Weapon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a black hole weapon — a gravity vortex that pulls live chunks inward for core damage and repels dead chunks outward.

**Architecture:** `src/game/blackhole.ts` contains a `BlackHole` class that runs per-frame gravity (attract live, repel dead) and core damage. GameScene creates the visual (dark purple circle + range indicator), calls `BlackHole.update()` each frame. Same `WeaponInstance` extension pattern as laser/missile.

**Tech Stack:** Phaser 3 + Matter.js, TypeScript, Vitest

---

### Task 1: Add blackhole params to upgradeApplier + tests

**Files:**
- Modify: `src/game/upgradeApplier.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Add five fields to `EffectiveGameplayParams`**

After `missileHoming`:

```typescript
readonly blackholePullRange: number;
readonly blackholePullForce: number;
readonly blackholeCoreSize: number;
readonly blackholeCoreDamage: number;
readonly blackholeMaxTargets: number;
```

- [ ] **Step 2: Add base values and per-level constants**

Add to `BASE_PARAMS`:
```typescript
blackholePullRange: 60,
blackholePullForce: 0.0003,
blackholeCoreSize: 15,
blackholeCoreDamage: 1,
blackholeMaxTargets: 3,
```

Add constants:
```typescript
const BLACKHOLE_PULL_RANGE_PER_LEVEL = 8;
const BLACKHOLE_PULL_FORCE_PER_LEVEL = 0.00015;
const BLACKHOLE_CORE_SIZE_PER_LEVEL = 3;
const BLACKHOLE_CORE_DAMAGE_PER_LEVEL = 0.5;
const BLACKHOLE_MAX_TARGETS_PER_LEVEL = 1;
```

- [ ] **Step 3: Wire in `applyUpgrades`**

```typescript
blackholePullRange: BASE_PARAMS.blackholePullRange + lv('blackhole.pullRange') * BLACKHOLE_PULL_RANGE_PER_LEVEL,
blackholePullForce: BASE_PARAMS.blackholePullForce + lv('blackhole.pullForce') * BLACKHOLE_PULL_FORCE_PER_LEVEL,
blackholeCoreSize: BASE_PARAMS.blackholeCoreSize + lv('blackhole.coreSize') * BLACKHOLE_CORE_SIZE_PER_LEVEL,
blackholeCoreDamage: BASE_PARAMS.blackholeCoreDamage + lv('blackhole.coreDamage') * BLACKHOLE_CORE_DAMAGE_PER_LEVEL,
blackholeMaxTargets: BASE_PARAMS.blackholeMaxTargets + lv('blackhole.maxTargets') * BLACKHOLE_MAX_TARGETS_PER_LEVEL,
```

- [ ] **Step 4: Add tests**

```typescript
it('increases blackholePullRange per level', () => {
  expect(applyUpgrades({}).blackholePullRange).toBe(60);
  expect(applyUpgrades({ 'blackhole.pullRange': 5 }).blackholePullRange).toBe(60 + 5 * 8);
});

it('increases blackholePullForce per level', () => {
  expect(applyUpgrades({}).blackholePullForce).toBe(0.0003);
  expect(applyUpgrades({ 'blackhole.pullForce': 4 }).blackholePullForce).toBeCloseTo(0.0003 + 4 * 0.00015);
});

it('increases blackholeCoreSize per level', () => {
  expect(applyUpgrades({}).blackholeCoreSize).toBe(15);
  expect(applyUpgrades({ 'blackhole.coreSize': 3 }).blackholeCoreSize).toBe(15 + 3 * 3);
});

it('increases blackholeCoreDamage per level', () => {
  expect(applyUpgrades({}).blackholeCoreDamage).toBe(1);
  expect(applyUpgrades({ 'blackhole.coreDamage': 6 }).blackholeCoreDamage).toBeCloseTo(1 + 6 * 0.5);
});

it('increases blackholeMaxTargets per level', () => {
  expect(applyUpgrades({}).blackholeMaxTargets).toBe(3);
  expect(applyUpgrades({ 'blackhole.maxTargets': 4 }).blackholeMaxTargets).toBe(3 + 4);
});
```

- [ ] **Step 5: Typecheck and run tests**
- [ ] **Step 6: Commit**

---

### Task 2: Unlock blackhole in weaponCatalog

**Files:**
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/weaponCatalog.test.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Unlock blackhole and add 5 upgrade defs**
- [ ] **Step 2: Update locked test (no weapons locked now)**
- [ ] **Step 3: Add 5 blackhole IDs to allUpgradeDefs test**
- [ ] **Step 4: Run tests, commit**

---

### Task 3: Create blackhole.ts

**Files:**
- Create: `src/game/blackhole.ts`

- [ ] **Step 1: Create the file**
- [ ] **Step 2: Typecheck, commit**

---

### Task 4: Wire blackhole into GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Import, extend WeaponInstance, add texture, spawn init**
- [ ] **Step 2: Add update loop call**
- [ ] **Step 3: Add updateBlackHole method**
- [ ] **Step 4: Cleanup, typecheck, tests, commit**

---

### Task 5: Chrome verification
### Task 6: Docs update
### Task 7: Code review
