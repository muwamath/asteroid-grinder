# Saw Upgrade Tree Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new Saw upgrades (Spin Speed, Orbit Speed, Blade Size) to complete the 5-upgrade saw tree.

**Architecture:** Data-driven upgrades via `weaponCatalog.ts` definitions + `upgradeApplier.ts` param computation. `GameScene` reads effective params each frame / on upgrade events. Blade spin creates tangential impulse on chunk contact (approach A — static blades, fake impulse). Blade size triggers texture regeneration + physics body rebuild.

**Tech Stack:** Phaser 3 + Matter.js, TypeScript, Vitest

---

### Task 1: Add new params to EffectiveGameplayParams and applyUpgrades

**Files:**
- Modify: `src/game/upgradeApplier.ts`

- [ ] **Step 1: Add three fields to `EffectiveGameplayParams` interface**

In `src/game/upgradeApplier.ts`, add after the `maxChunks` field:

```typescript
readonly bladeSpinSpeed: number;
readonly orbitSpeed: number;
readonly bladeRadius: number;
```

- [ ] **Step 2: Add base values and per-level constants**

Add to `BASE_PARAMS`:

```typescript
bladeSpinSpeed: 0.005,
orbitSpeed: 1,
bladeRadius: 6,
```

Add new per-level constants after the existing ones:

```typescript
const BLADE_SPIN_SPEED_PER_LEVEL = 0.005;
const ORBIT_SPEED_PER_LEVEL = 0.6;
const BLADE_RADIUS_PER_LEVEL = 2;
```

- [ ] **Step 3: Wire the new params in `applyUpgrades`**

Add to the return object:

```typescript
bladeSpinSpeed: BASE_PARAMS.bladeSpinSpeed + lv('saw.spinSpeed') * BLADE_SPIN_SPEED_PER_LEVEL,
orbitSpeed: BASE_PARAMS.orbitSpeed + lv('saw.orbitSpeed') * ORBIT_SPEED_PER_LEVEL,
bladeRadius: BASE_PARAMS.bladeRadius + lv('saw.bladeSize') * BLADE_RADIUS_PER_LEVEL,
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: clean (no output)

- [ ] **Step 5: Commit**

```bash
git add src/game/upgradeApplier.ts
git commit -m "add bladeSpinSpeed, orbitSpeed, bladeRadius to effective params"
```

---

### Task 2: Add tests for new params

**Files:**
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Add test for bladeSpinSpeed**

Add inside the `describe('applyUpgrades', ...)` block:

```typescript
it('increases bladeSpinSpeed per level', () => {
  expect(applyUpgrades({}).bladeSpinSpeed).toBe(0.005);
  expect(applyUpgrades({ 'saw.spinSpeed': 4 }).bladeSpinSpeed).toBeCloseTo(0.005 + 4 * 0.005);
});
```

- [ ] **Step 2: Add test for orbitSpeed**

```typescript
it('increases orbitSpeed per level', () => {
  expect(applyUpgrades({}).orbitSpeed).toBe(1);
  expect(applyUpgrades({ 'saw.orbitSpeed': 5 }).orbitSpeed).toBeCloseTo(1 + 5 * 0.6);
});
```

- [ ] **Step 3: Add test for bladeRadius**

```typescript
it('increases bladeRadius per level', () => {
  expect(applyUpgrades({}).bladeRadius).toBe(6);
  expect(applyUpgrades({ 'saw.bladeSize': 3 }).bladeRadius).toBe(6 + 3 * 2);
});
```

- [ ] **Step 4: Update the combined upgrades test to include new base values**

The existing `'returns base params when no levels are set'` test uses `toEqual(BASE_PARAMS)` which will automatically cover the new fields. No change needed — just verify it still passes.

- [ ] **Step 5: Update the allUpgradeDefs test**

In the `'defines all expected upgrades'` test, add the three new IDs to the `arrayContaining`:

```typescript
expect(ids).toEqual(
  expect.arrayContaining([
    'saw.damage',
    'saw.bladeCount',
    'saw.spinSpeed',
    'saw.orbitSpeed',
    'saw.bladeSize',
    'chute.channelWidth',
    'asteroids.dropRate',
    'asteroids.chunkHp',
    'asteroids.asteroidSize',
  ]),
);
```

Note: this test will fail until Task 3 adds the upgrade defs to the catalog. That's expected.

- [ ] **Step 6: Run tests**

Run: `npx vitest run`
Expected: the `'defines all expected upgrades'` test fails (catalog not updated yet). All other tests pass, including the 3 new param tests.

- [ ] **Step 7: Commit**

```bash
git add src/game/upgradeApplier.test.ts
git commit -m "test: add coverage for new saw upgrade params"
```

---

### Task 3: Add upgrade definitions to weapon catalog

**Files:**
- Modify: `src/game/weaponCatalog.ts`

- [ ] **Step 1: Add the three UpgradeDef entries to the saw's upgrades array**

In the `saw` entry of `WEAPON_TYPES`, append after the existing `saw.bladeCount` def:

```typescript
{
  id: 'saw.spinSpeed',
  name: 'Spin Speed',
  description: 'Blades spin faster, pushing chunks along',
  category: 'saw',
  baseCost: 1,
  growthRate: 1,
  maxLevel: 10,
},
{
  id: 'saw.orbitSpeed',
  name: 'Orbit Speed',
  description: 'Blades sweep around the arbor faster',
  category: 'saw',
  baseCost: 1,
  growthRate: 1,
  maxLevel: 10,
},
{
  id: 'saw.bladeSize',
  name: 'Blade Size',
  description: 'Bigger blades, wider damage zone',
  category: 'saw',
  baseCost: 1,
  growthRate: 1,
  maxLevel: 8,
},
```

- [ ] **Step 2: Run all tests — should all pass now**

Run: `npx vitest run`
Expected: all tests pass including the previously-failing `'defines all expected upgrades'` test.

- [ ] **Step 3: Commit**

```bash
git add src/game/weaponCatalog.ts
git commit -m "add spin speed, orbit speed, blade size upgrade defs to saw"
```

---

### Task 4: Wire orbit speed and spin speed into GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Remove the `SAW_ORBIT_RAD_PER_SEC` constant**

Delete line 11:
```typescript
const SAW_ORBIT_RAD_PER_SEC = 4;
```

- [ ] **Step 2: Replace orbit speed usage in `update()`**

In the `update()` method, change:
```typescript
inst.orbitAngle += dir * (SAW_ORBIT_RAD_PER_SEC * delta) / 1000;
```
to:
```typescript
inst.orbitAngle += dir * (this.effectiveParams.orbitSpeed * delta) / 1000;
```

- [ ] **Step 3: Replace visual spin rate in `update()`**

Change:
```typescript
blade.setRotation(blade.rotation + delta * 0.02);
```
to:
```typescript
blade.setRotation(blade.rotation + delta * this.effectiveParams.bladeSpinSpeed);
```

- [ ] **Step 4: Add tangential impulse to `handleContact()`**

The contact handler currently identifies a saw-chunk pair, applies damage, and spawns a spark. After the `this.spawnSpark(chunk.x, chunk.y);` line, add the tangential push logic. The full replacement for the end of `handleContact` (after `this.weaponHits++;`):

```typescript
    this.weaponHits++;
    this.spawnSpark(chunk.x, chunk.y);

    if (result.killed) {
      this.killedBySaw++;
    }

    // Tangential impulse — spinning blade pushes chunks along its surface.
    // Find which blade hit this chunk and compute tangential direction.
    const bladeGo = goA.getData('kind') === 'saw' ? goA : goB;
    const bx = (bladeGo as Phaser.Physics.Matter.Image).x;
    const by = (bladeGo as Phaser.Physics.Matter.Image).y;
    const dx = chunk.x - bx;
    const dy = chunk.y - by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) {
      // Tangential direction perpendicular to radial, in spin direction.
      // Blade visual spin is always positive (CW in screen coords).
      const tx = -dy / dist;
      const ty = dx / dist;
      const strength = this.effectiveParams.bladeSpinSpeed * this.effectiveParams.bladeRadius;
      chunk.applyForce(new Phaser.Math.Vector2(tx * strength, ty * strength));
    }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "wire orbit speed + spin speed + tangential impulse into GameScene"
```

---

### Task 5: Wire blade size — dynamic texture + physics rebuild

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Remove the `SAW_BLADE_RADIUS` constant**

Delete line 10:
```typescript
const SAW_BLADE_RADIUS = 6;
```

- [ ] **Step 2: Make `makeSawBladeTexture` accept a radius parameter**

Change the method signature and body:

```typescript
private makeSawBladeTexture(radius: number): void {
  const d = radius * 2 + 4;
  const cx = d / 2;
  const cy = d / 2;
  const r = radius;
  const g = this.make.graphics({ x: 0, y: 0 }, false);

  // 4-quadrant pinwheel: opposite quadrants same color
  const colors = [0xdddde8, 0x555566];
  for (let i = 0; i < 4; i++) {
    const startAngle = (i * Math.PI) / 2;
    const endAngle = ((i + 1) * Math.PI) / 2;
    g.fillStyle(colors[i % 2]);
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, startAngle, endAngle, false);
    g.closePath();
    g.fillPath();
  }

  g.lineStyle(1, 0x888898);
  g.strokeCircle(cx, cy, r);
  g.fillStyle(0x3a3a4c);
  g.fillCircle(cx, cy, 2.5);
  g.generateTexture('saw-blade', d, d);
  g.destroy();
}
```

- [ ] **Step 3: Update `preload()` to pass base radius**

Change:
```typescript
this.makeSawBladeTexture();
```
to:
```typescript
this.makeSawBladeTexture(BASE_PARAMS.bladeRadius);
```

- [ ] **Step 4: Update `rebuildBladesForInstance` to use dynamic radius**

Change the method signature to accept a radius:

```typescript
private rebuildBladesForInstance(instance: WeaponInstance, count: number, radius: number): void {
  for (const blade of instance.blades) blade.destroy();
  instance.blades = [];
  for (let i = 0; i < count; i++) {
    const blade = this.matter.add.image(0, 0, 'saw-blade');
    blade.setCircle(radius);
    blade.setStatic(true);
    blade.setIgnoreGravity(true);
    blade.setFrictionAir(0);
    blade.setDepth(0);
    blade.setData('kind', 'saw');
    instance.blades.push(blade);
  }
}
```

- [ ] **Step 5: Update all call sites of `rebuildBladesForInstance`**

There are three call sites. Update each:

In `spawnWeaponInstance`:
```typescript
this.rebuildBladesForInstance(instance, this.effectiveParams.bladeCount, this.effectiveParams.bladeRadius);
```

In `recomputeEffectiveParams` (the existing bladeCount change handler):
```typescript
this.rebuildBladesForInstance(inst, this.effectiveParams.bladeCount, this.effectiveParams.bladeRadius);
```

- [ ] **Step 6: Add blade size + radius change detection to `recomputeEffectiveParams`**

Replace the existing `bladeCount` change check with a combined check that triggers on either blade count OR blade size changes:

```typescript
if (this.effectiveParams.bladeCount !== prev.bladeCount ||
    this.effectiveParams.bladeRadius !== prev.bladeRadius) {
  if (this.effectiveParams.bladeRadius !== prev.bladeRadius) {
    this.makeSawBladeTexture(this.effectiveParams.bladeRadius);
  }
  for (const inst of this.weaponInstances) {
    if (inst.type === 'saw') {
      this.rebuildBladesForInstance(inst, this.effectiveParams.bladeCount, this.effectiveParams.bladeRadius);
    }
  }
}
```

- [ ] **Step 7: Update barrier enforcement to use dynamic blade radius**

In `enforceWeaponBarriers`, change:
```typescript
const bladeMin = SAW_BLADE_RADIUS + CHUNK_HALF + BARRIER_BUFFER;
```
to:
```typescript
const bladeMin = this.effectiveParams.bladeRadius + CHUNK_HALF + BARRIER_BUFFER;
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean — no remaining references to `SAW_BLADE_RADIUS` or `SAW_ORBIT_RAD_PER_SEC`.

- [ ] **Step 9: Run all tests**

Run: `npx vitest run`
Expected: all pass (40 existing + 3 new = 43 tests)

- [ ] **Step 10: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "wire blade size: dynamic texture, physics rebuild, barrier enforcement"
```

---

### Task 6: Chrome verification

**Files:** none (testing only)

- [ ] **Step 1: Start dev server and open in Chrome**

Run: `npm run dev`
Open: http://localhost:5173

- [ ] **Step 2: Verify base behavior feels slower**

Confirm orbit speed is noticeably slower (1 rad/s vs old 4). Blades should crawl around the arbor. Blade spin should be barely visible at base level.

- [ ] **Step 3: Buy Spin Speed upgrades and verify tangential push**

Open the Saw sub-panel. Buy several Spin Speed levels. Observe that chunks in contact with blades get pushed tangentially — dead chunks should slide away, live chunks should feed into contact.

- [ ] **Step 4: Buy Orbit Speed upgrades and verify sweep**

Buy several Orbit Speed levels. Blades should orbit noticeably faster, sweeping across more chunks.

- [ ] **Step 5: Buy Blade Size upgrades and verify visual + physics growth**

Buy Blade Size levels. Blades should visibly grow larger. At high levels, blades extend past the arbor edge. Larger blades should block more of the channel.

- [ ] **Step 6: Check console for errors**

Open DevTools console. Confirm zero errors/warnings during all upgrade interactions.

- [ ] **Step 7: Commit (no file changes expected — verification only)**

No commit needed unless issues found.

---

### Task 7: Update docs and final commit

**Files:**
- Modify: `ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update ROADMAP.md**

Add a note under Phase 5 or Immediate Next that saw upgrades (spin, orbit, size) are done. Update the Phase 5 todos to reflect remaining work.

- [ ] **Step 2: Update CLAUDE.md if any new gotchas discovered**

If Chrome verification revealed any new Phaser/Matter gotchas, document them in the gotchas section.

- [ ] **Step 3: Run full verification gate**

```bash
npx tsc --noEmit && npx vitest run && npx vite build
```

All three must pass.

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md CLAUDE.md
git commit -m "docs: saw upgrade tree expansion complete"
```

---

### Task 8: Code review

**Files:** all changed files from Tasks 1-7

- [ ] **Step 1: Dispatch a fresh code reviewer agent**

The reviewer should check:
- All 3 new params flow correctly from catalog -> applier -> GameScene
- Tangential impulse direction/magnitude is reasonable
- Dynamic texture regeneration doesn't leak textures
- Barrier enforcement uses dynamic radius everywhere
- No remaining references to removed constants
- Test coverage is adequate

- [ ] **Step 2: Address review findings**

Fix any issues found by the reviewer.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "review fixes: saw upgrade tree"
```
