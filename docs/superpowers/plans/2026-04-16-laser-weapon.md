# Laser Weapon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a laser turret weapon — a draggable square that auto-targets the nearest chunk, rotates toward it, and fires a continuous damage beam.

**Architecture:** Laser targeting logic lives in `src/game/laser.ts` (state machine: idle → acquiring → rotating → firing → cooldown). GameScene creates visual sprite + Graphics beam line per instance, calls `Laser.update()` each frame, draws beam and applies damage based on the result. Extends existing `WeaponInstance` interface with optional laser fields.

**Tech Stack:** Phaser 3 + Matter.js, TypeScript, Vitest

---

### Task 1: Add laser params to upgradeApplier

**Files:**
- Modify: `src/game/upgradeApplier.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Add four fields to `EffectiveGameplayParams` interface**

In `src/game/upgradeApplier.ts`, add after the `bladeRadius` field:

```typescript
readonly laserAimSpeed: number;
readonly laserRange: number;
readonly laserDamage: number;
readonly laserCooldown: number;
```

- [ ] **Step 2: Add base values and per-level constants**

Add to `BASE_PARAMS`:

```typescript
laserAimSpeed: 30,
laserRange: 60,
laserDamage: 1,
laserCooldown: 2,
```

Add new per-level constants:

```typescript
const LASER_AIM_SPEED_PER_LEVEL = 16.5;
const LASER_RANGE_PER_LEVEL = 20;
const LASER_DAMAGE_PER_LEVEL = 0.5;
const LASER_COOLDOWN_PER_LEVEL = 0.095;
const LASER_MIN_COOLDOWN = 0.1;
```

- [ ] **Step 3: Wire the new params in `applyUpgrades`**

Add to the return object:

```typescript
laserAimSpeed: BASE_PARAMS.laserAimSpeed + lv('laser.aimSpeed') * LASER_AIM_SPEED_PER_LEVEL,
laserRange: BASE_PARAMS.laserRange + lv('laser.range') * LASER_RANGE_PER_LEVEL,
laserDamage: BASE_PARAMS.laserDamage + lv('laser.damage') * LASER_DAMAGE_PER_LEVEL,
laserCooldown: Math.max(
  LASER_MIN_COOLDOWN,
  BASE_PARAMS.laserCooldown - lv('laser.cooldown') * LASER_COOLDOWN_PER_LEVEL,
),
```

- [ ] **Step 4: Add tests**

In `src/game/upgradeApplier.test.ts`, add inside the `describe('applyUpgrades', ...)` block:

```typescript
it('increases laserAimSpeed per level', () => {
  expect(applyUpgrades({}).laserAimSpeed).toBe(30);
  expect(applyUpgrades({ 'laser.aimSpeed': 4 }).laserAimSpeed).toBeCloseTo(30 + 4 * 16.5);
});

it('increases laserRange per level', () => {
  expect(applyUpgrades({}).laserRange).toBe(60);
  expect(applyUpgrades({ 'laser.range': 5 }).laserRange).toBe(60 + 5 * 20);
});

it('increases laserDamage per level', () => {
  expect(applyUpgrades({}).laserDamage).toBe(1);
  expect(applyUpgrades({ 'laser.damage': 6 }).laserDamage).toBeCloseTo(1 + 6 * 0.5);
});

it('decreases laserCooldown per level with floor', () => {
  expect(applyUpgrades({}).laserCooldown).toBe(2);
  expect(applyUpgrades({ 'laser.cooldown': 5 }).laserCooldown).toBeCloseTo(2 - 5 * 0.095);
  expect(applyUpgrades({ 'laser.cooldown': 99 }).laserCooldown).toBe(0.1);
});
```

- [ ] **Step 5: Run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean. The `'defines all expected upgrades'` test fails (catalog not updated yet). All other tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/upgradeApplier.ts src/game/upgradeApplier.test.ts
git commit -m "add laser params to EffectiveGameplayParams"
```

---

### Task 2: Unlock laser in weaponCatalog

**Files:**
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Unlock laser and add upgrade defs**

In `src/game/weaponCatalog.ts`, replace the laser entry:

```typescript
{
  id: 'laser',
  name: 'Laser',
  icon: 'laser',
  locked: false,
  startCount: 1,
  upgrades: [
    {
      id: 'laser.aimSpeed',
      name: 'Aim Speed',
      description: 'Turret rotates to targets faster',
      category: 'laser',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
    {
      id: 'laser.range',
      name: 'Range',
      description: 'Beam reaches further',
      category: 'laser',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
    {
      id: 'laser.damage',
      name: 'Damage',
      description: 'More DPS while firing',
      category: 'laser',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
    {
      id: 'laser.cooldown',
      name: 'Cooldown',
      description: 'Less delay between targets',
      category: 'laser',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
  ],
},
```

- [ ] **Step 2: Update the allUpgradeDefs test**

In `src/game/upgradeApplier.test.ts`, add the 4 laser IDs to the `arrayContaining`:

```typescript
expect(ids).toEqual(
  expect.arrayContaining([
    'saw.damage',
    'saw.bladeCount',
    'saw.spinSpeed',
    'saw.orbitSpeed',
    'saw.bladeSize',
    'laser.aimSpeed',
    'laser.range',
    'laser.damage',
    'laser.cooldown',
    'chute.channelWidth',
    'asteroids.dropRate',
    'asteroids.chunkHp',
    'asteroids.asteroidSize',
  ]),
);
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: all pass (47 tests — 43 existing + 4 new laser param tests).

- [ ] **Step 4: Commit**

```bash
git add src/game/weaponCatalog.ts src/game/upgradeApplier.test.ts
git commit -m "unlock laser weapon, add 4 upgrade defs"
```

---

### Task 3: Create Laser class

**Files:**
- Create: `src/game/laser.ts`

- [ ] **Step 1: Create `src/game/laser.ts`**

```typescript
import Phaser from 'phaser';

const DEG_TO_RAD = Math.PI / 180;
const FIRE_CONE_RAD = 15 * DEG_TO_RAD;

export interface LaserParams {
  aimSpeed: number;     // degrees per second
  range: number;        // pixels
  damage: number;       // DPS
  cooldown: number;     // seconds
}

export class Laser {
  aimAngle = -Math.PI / 2; // barrel points up initially
  target: Phaser.Physics.Matter.Image | null = null;
  cooldownRemaining: number;
  firing = false;

  constructor(initialCooldown: number) {
    this.cooldownRemaining = Math.random() * initialCooldown;
  }

  /** Run once per frame. Returns damage to apply (0 if not firing). */
  update(
    deltaMs: number,
    originX: number,
    originY: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: LaserParams,
  ): number {
    const dt = deltaMs / 1000;

    // ── cooldown ──
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining -= dt;
      this.firing = false;
      return 0;
    }

    // ── validate current target ──
    if (this.target) {
      if (!this.target.active || this.target.getData('dead')) {
        this.loseTarget(params.cooldown);
        return 0;
      }
      const dist = Phaser.Math.Distance.Between(originX, originY, this.target.x, this.target.y);
      if (dist > params.range) {
        this.loseTarget(params.cooldown);
        return 0;
      }
    }

    // ── acquire target if needed ──
    if (!this.target) {
      this.target = this.findBestTarget(originX, originY, chunks, params.range);
      if (!this.target) {
        this.firing = false;
        return 0;
      }
    }

    // ── rotate toward target ──
    const targetAngle = Math.atan2(
      this.target.y - originY,
      this.target.x - originX,
    );
    const maxRot = params.aimSpeed * DEG_TO_RAD * dt;
    this.aimAngle = rotateToward(this.aimAngle, targetAngle, maxRot);

    // ── fire if within cone ──
    const angleDiff = Math.abs(angleDelta(this.aimAngle, targetAngle));
    if (angleDiff <= FIRE_CONE_RAD) {
      this.firing = true;
      return params.damage * dt;
    }

    this.firing = false;
    return 0;
  }

  /** Barrel tip position for beam origin. */
  emitPoint(originX: number, originY: number, radius: number): { x: number; y: number } {
    return {
      x: originX + Math.cos(this.aimAngle) * radius,
      y: originY + Math.sin(this.aimAngle) * radius,
    };
  }

  private loseTarget(cooldown: number): void {
    this.target = null;
    this.firing = false;
    this.cooldownRemaining = cooldown;
  }

  private findBestTarget(
    ox: number,
    oy: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    range: number,
  ): Phaser.Physics.Matter.Image | null {
    let best: Phaser.Physics.Matter.Image | null = null;
    let bestScore = Infinity;

    for (const chunk of chunks) {
      if (!chunk.active || chunk.getData('dead')) continue;
      const dist = Phaser.Math.Distance.Between(ox, oy, chunk.x, chunk.y);
      if (dist > range) continue;

      const angle = Math.atan2(chunk.y - oy, chunk.x - ox);
      const angDiff = Math.abs(angleDelta(this.aimAngle, angle));
      // Score: angular distance (radians) + normalized linear distance.
      // Angular proximity is weighted more heavily.
      const score = angDiff + (dist / range) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = chunk;
      }
    }

    return best;
  }
}

/** Signed shortest angular difference, normalized to [-PI, PI]. */
function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Rotate `from` toward `to` by at most `maxStep` radians. */
function rotateToward(from: number, to: number, maxStep: number): number {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/game/laser.ts
git commit -m "create Laser class with targeting + rotation + cooldown"
```

---

### Task 4: Wire laser into GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add imports and constants**

Add import at top of file:

```typescript
import { Laser } from '../game/laser';
```

Add constant:

```typescript
const LASER_TURRET_SIZE = ARBOR_RADIUS * 2; // 40px square
```

- [ ] **Step 2: Extend WeaponInstance interface**

Add optional fields:

```typescript
interface WeaponInstance {
  id: string;
  type: string;
  sprite: Phaser.Physics.Matter.Image;
  orbitAngle: number;
  blades: Phaser.Physics.Matter.Image[];
  laser?: Laser;
  beamGfx?: Phaser.GameObjects.Graphics;
}
```

- [ ] **Step 3: Add laser texture generation**

Add to the class, after `makeSawBladeTexture`:

```typescript
private makeLaserTexture(): void {
  const s = LASER_TURRET_SIZE;
  const g = this.make.graphics({ x: 0, y: 0 }, false);
  // Dark red body
  g.fillStyle(0x442222);
  g.fillRect(0, 0, s, s);
  // Bright barrel edge (top = firing direction before rotation)
  g.fillStyle(0xff3333);
  g.fillRect(0, 0, s, 4);
  // Border
  g.lineStyle(1, 0x663333);
  g.strokeRect(0.5, 0.5, s - 1, s - 1);
  g.generateTexture('laser-turret', s, s);
  g.destroy();
}
```

Call it from `preload()`:

```typescript
this.makeLaserTexture();
```

- [ ] **Step 4: Update `spawnWeaponInstance` for laser type**

Replace the texture key logic and add laser initialization. Change:

```typescript
const texKey = typeId === 'saw' ? 'arbor' : typeId;
```

to:

```typescript
const texKey = typeId === 'saw' ? 'arbor' : typeId === 'laser' ? 'laser-turret' : typeId;
```

After the `if (typeId === 'saw')` block that rebuilds blades, add:

```typescript
if (typeId === 'laser') {
  instance.laser = new Laser(this.effectiveParams.laserCooldown);
  instance.beamGfx = this.add.graphics();
  instance.beamGfx.setDepth(2);
}
```

- [ ] **Step 5: Add laser update method**

Add after the saw update block in `update()`:

```typescript
for (const inst of this.weaponInstances) {
  if (inst.type === 'laser' && inst.laser) {
    this.updateLaser(inst, delta);
  }
}
```

Add the `updateLaser` method:

```typescript
private updateLaser(inst: WeaponInstance, delta: number): void {
  const laser = inst.laser!;
  const params = {
    aimSpeed: this.effectiveParams.laserAimSpeed,
    range: this.effectiveParams.laserRange,
    damage: this.effectiveParams.laserDamage,
    cooldown: this.effectiveParams.laserCooldown,
  };

  const dmg = laser.update(delta, inst.sprite.x, inst.sprite.y, this.chunkImages, params);

  // Rotate the sprite to match aim direction.
  // Texture barrel is at top (y=0), which is -PI/2 in Phaser coords.
  inst.sprite.setRotation(laser.aimAngle + Math.PI / 2);

  // Draw beam.
  const gfx = inst.beamGfx!;
  gfx.clear();

  if (laser.firing && laser.target && laser.target.active) {
    const emit = laser.emitPoint(inst.sprite.x, inst.sprite.y, ARBOR_RADIUS);
    gfx.lineStyle(2, 0xff3333, 0.8);
    gfx.beginPath();
    gfx.moveTo(emit.x, emit.y);
    gfx.lineTo(laser.target.x, laser.target.y);
    gfx.strokePath();

    // Apply damage.
    if (dmg > 0) {
      const asteroid = laser.target.getData('asteroid') as Asteroid | undefined;
      if (asteroid) {
        asteroid.damageChunkByImage(laser.target, dmg);
      }
    }
  }
}
```

- [ ] **Step 6: Update cleanup in `onWeaponCountChanged` and shutdown**

In `onWeaponCountChanged`, the sell branch already destroys `victim.sprite` and removes blades. Add beam cleanup. After `for (const blade of victim.blades) blade.destroy();`:

```typescript
victim.beamGfx?.destroy();
```

In the `shutdown` handler, after `for (const blade of inst.blades) blade.destroy();`:

```typescript
inst.beamGfx?.destroy();
```

- [ ] **Step 7: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean, all 47 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "wire laser into GameScene: texture, spawn, update, beam, damage"
```

---

### Task 5: Chrome verification

**Files:** none (testing only)

- [ ] **Step 1: Start dev server and open in Chrome**

Run: `npm run dev`
Open: http://localhost:5173

- [ ] **Step 2: Verify laser spawns and is draggable**

A laser turret (dark red square with bright top edge) should appear in the channel alongside the saw. Drag it around — it should clamp within channel bounds.

- [ ] **Step 3: Verify targeting and rotation**

The laser should slowly rotate toward the nearest chunk. At base aim speed (30 deg/s), rotation should be visibly slow. Once aimed, a red beam line should appear connecting the barrel to the target chunk.

- [ ] **Step 4: Verify sticky aim and cooldown**

The beam should stay locked on one chunk until it dies. After the chunk dies, the beam disappears and there's a visible pause (~2 seconds at base cooldown) before it targets the next chunk.

- [ ] **Step 5: Verify damage**

Chunks under the beam should lose HP and eventually die. At base 1 DPS with 3 HP chunks, a chunk should take ~3 seconds to kill.

- [ ] **Step 6: Buy upgrades and verify effects**

Click L (Laser) button. Buy Aim Speed — rotation should get noticeably faster. Buy Range — beam should reach further chunks. Buy Damage — chunks die faster. Buy Cooldown — less pause between targets.

- [ ] **Step 7: Check console for errors**

Open DevTools console. Confirm zero errors/warnings.

---

### Task 6: Update docs

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update ROADMAP.md**

In the Immediate Next section, add a done entry for the laser. Update the Phase 5 current todos to remove the laser item.

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: laser weapon complete"
```

---

### Task 7: Code review

- [ ] **Step 1: Dispatch a fresh code reviewer agent**

The reviewer should check:
- Laser targeting logic correctness (angular scoring, sticky aim, cooldown state machine)
- Beam visual draws from correct emit point and clears properly
- Damage application uses DPS * dt correctly
- Cleanup on sell/shutdown (no leaked Graphics objects)
- Barrier enforcement covers laser turret (already handled by existing sprite loop)
- No performance issues with per-frame chunk iteration in `findBestTarget`

- [ ] **Step 2: Address review findings and commit fixes**
