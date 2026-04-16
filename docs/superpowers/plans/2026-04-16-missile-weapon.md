# Missile Weapon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a missile launcher weapon — a draggable turret that fires homing projectiles with AOE detonation on live chunks.

**Architecture:** `src/game/missile.ts` contains two classes: `MissileLauncher` (targeting, lead intercept, fire timing) and `MissileProjectile` (movement, homing, detonation check). GameScene manages launcher instances on `WeaponInstance`, maintains a flat array of active projectiles, updates all projectiles per frame, and handles detonation (AOE damage + brief explosion visual). Projectiles are visual-only (no physics bodies).

**Tech Stack:** Phaser 3 + Matter.js, TypeScript, Vitest

---

### Task 1: Add missile params to upgradeApplier

**Files:**
- Modify: `src/game/upgradeApplier.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Add five fields to `EffectiveGameplayParams` interface**

In `src/game/upgradeApplier.ts`, add after the `laserCooldown` field:

```typescript
readonly missileFireInterval: number;
readonly missileDamage: number;
readonly missileBlastRadius: number;
readonly missileSpeed: number;
readonly missileHoming: number;
```

- [ ] **Step 2: Add base values and per-level constants**

Add to `BASE_PARAMS`:

```typescript
missileFireInterval: 5,
missileDamage: 2,
missileBlastRadius: 20,
missileSpeed: 80,
missileHoming: 0,
```

Add new per-level constants:

```typescript
const MISSILE_FIRE_INTERVAL_PER_LEVEL = 0.225;
const MISSILE_MIN_FIRE_INTERVAL = 0.5;
const MISSILE_DAMAGE_PER_LEVEL = 1.5;
const MISSILE_BLAST_RADIUS_PER_LEVEL = 4;
const MISSILE_SPEED_PER_LEVEL = 12;
const MISSILE_HOMING_PER_LEVEL = 0.5;
```

- [ ] **Step 3: Wire the new params in `applyUpgrades`**

Add to the return object:

```typescript
missileFireInterval: Math.max(
  MISSILE_MIN_FIRE_INTERVAL,
  BASE_PARAMS.missileFireInterval - lv('missile.fireRate') * MISSILE_FIRE_INTERVAL_PER_LEVEL,
),
missileDamage: BASE_PARAMS.missileDamage + lv('missile.damage') * MISSILE_DAMAGE_PER_LEVEL,
missileBlastRadius: BASE_PARAMS.missileBlastRadius + lv('missile.blastRadius') * MISSILE_BLAST_RADIUS_PER_LEVEL,
missileSpeed: BASE_PARAMS.missileSpeed + lv('missile.speed') * MISSILE_SPEED_PER_LEVEL,
missileHoming: BASE_PARAMS.missileHoming + lv('missile.homing') * MISSILE_HOMING_PER_LEVEL,
```

- [ ] **Step 4: Add tests**

In `src/game/upgradeApplier.test.ts`, add inside the `describe('applyUpgrades', ...)` block:

```typescript
it('decreases missileFireInterval per level with floor', () => {
  expect(applyUpgrades({}).missileFireInterval).toBe(5);
  expect(applyUpgrades({ 'missile.fireRate': 4 }).missileFireInterval).toBeCloseTo(5 - 4 * 0.225);
  expect(applyUpgrades({ 'missile.fireRate': 99 }).missileFireInterval).toBe(0.5);
});

it('increases missileDamage per level', () => {
  expect(applyUpgrades({}).missileDamage).toBe(2);
  expect(applyUpgrades({ 'missile.damage': 3 }).missileDamage).toBeCloseTo(2 + 3 * 1.5);
});

it('increases missileBlastRadius per level', () => {
  expect(applyUpgrades({}).missileBlastRadius).toBe(20);
  expect(applyUpgrades({ 'missile.blastRadius': 5 }).missileBlastRadius).toBe(20 + 5 * 4);
});

it('increases missileSpeed per level', () => {
  expect(applyUpgrades({}).missileSpeed).toBe(80);
  expect(applyUpgrades({ 'missile.speed': 4 }).missileSpeed).toBe(80 + 4 * 12);
});

it('increases missileHoming per level', () => {
  expect(applyUpgrades({}).missileHoming).toBe(0);
  expect(applyUpgrades({ 'missile.homing': 6 }).missileHoming).toBeCloseTo(6 * 0.5);
});
```

- [ ] **Step 5: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean typecheck, catalog test fails (expected — IDs not in catalog yet), all other tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/upgradeApplier.ts src/game/upgradeApplier.test.ts
git commit -m "add missile params to EffectiveGameplayParams"
```

---

### Task 2: Unlock missile in weaponCatalog

**Files:**
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/weaponCatalog.test.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Unlock missile and add upgrade defs**

In `src/game/weaponCatalog.ts`, replace the missile entry:

```typescript
{
  id: 'missile',
  name: 'Missile',
  icon: 'missile',
  locked: false,
  startCount: 1,
  upgrades: [
    {
      id: 'missile.fireRate',
      name: 'Fire Rate',
      description: 'Fires missiles more often',
      category: 'missile',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
    {
      id: 'missile.damage',
      name: 'Damage',
      description: 'More AOE damage per missile',
      category: 'missile',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
    {
      id: 'missile.blastRadius',
      name: 'Blast Radius',
      description: 'Bigger explosion area',
      category: 'missile',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
    {
      id: 'missile.speed',
      name: 'Speed',
      description: 'Missiles fly faster',
      category: 'missile',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 20,
    },
    {
      id: 'missile.homing',
      name: 'Homing',
      description: 'Missiles track targets in flight',
      category: 'missile',
      baseCost: 1,
      growthRate: 1,
      maxLevel: 10,
    },
  ],
},
```

- [ ] **Step 2: Update weaponCatalog.test.ts locked test**

Change:

```typescript
it('defines missile and blackhole as locked, laser as unlocked', () => {
  expect(findWeaponType('laser')?.locked).toBe(false);
  expect(findWeaponType('missile')?.locked).toBe(true);
  expect(findWeaponType('blackhole')?.locked).toBe(true);
});
```

to:

```typescript
it('defines blackhole as locked, laser and missile as unlocked', () => {
  expect(findWeaponType('laser')?.locked).toBe(false);
  expect(findWeaponType('missile')?.locked).toBe(false);
  expect(findWeaponType('blackhole')?.locked).toBe(true);
});
```

- [ ] **Step 3: Update the allUpgradeDefs test**

In `src/game/upgradeApplier.test.ts`, add the 5 missile IDs to the `arrayContaining`:

```typescript
'missile.fireRate',
'missile.damage',
'missile.blastRadius',
'missile.speed',
'missile.homing',
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: all pass (52 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/weaponCatalog.ts src/game/weaponCatalog.test.ts src/game/upgradeApplier.test.ts
git commit -m "unlock missile weapon, add 5 upgrade defs"
```

---

### Task 3: Create missile.ts

**Files:**
- Create: `src/game/missile.ts`

- [ ] **Step 1: Create `src/game/missile.ts`**

```typescript
import Phaser from 'phaser';

const DEG_TO_RAD = Math.PI / 180;
const FIRE_CONE_RAD = 10 * DEG_TO_RAD;
const MISSILE_RANGE = 400;
const MISSILE_MAX_LIFETIME_S = 10;

export interface MissileParams {
  fireInterval: number;   // seconds between shots
  damage: number;         // AOE damage per missile
  blastRadius: number;    // px
  speed: number;          // px/s
  homing: number;         // tracking strength (0 = straight, 5 = sharp curves)
}

// ── Launcher ────────────────────────────────────────────────────────────

export class MissileLauncher {
  aimAngle = -Math.PI / 2;
  target: Phaser.Physics.Matter.Image | null = null;
  fireCooldown: number;

  constructor(initialInterval: number) {
    this.fireCooldown = Math.random() * initialInterval;
  }

  /**
   * Run once per frame. Returns a fire command if the launcher should
   * spawn a projectile this frame, or null otherwise.
   */
  update(
    deltaMs: number,
    originX: number,
    originY: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    params: MissileParams,
  ): { dirX: number; dirY: number; target: Phaser.Physics.Matter.Image } | null {
    const dt = deltaMs / 1000;

    // ── cooldown ──
    this.fireCooldown -= dt;

    // ── validate target ──
    if (this.target) {
      if (!this.target.active || this.target.getData('dead')) {
        this.target = null;
      } else {
        const dist = Phaser.Math.Distance.Between(originX, originY, this.target.x, this.target.y);
        if (dist > MISSILE_RANGE) this.target = null;
      }
    }

    // ── acquire target ──
    if (!this.target) {
      this.target = this.findBestTarget(originX, originY, chunks);
      if (!this.target) return null;
    }

    // ── rotate toward lead intercept point ──
    const intercept = this.leadIntercept(
      originX, originY, this.target, params.speed,
    );
    const targetAngle = Math.atan2(intercept.y - originY, intercept.x - originX);
    const maxRot = 360 * DEG_TO_RAD * dt; // 360 deg/s
    this.aimAngle = rotateToward(this.aimAngle, targetAngle, maxRot);

    // ── fire if aimed and cooldown ready ──
    const angleDiff = Math.abs(angleDelta(this.aimAngle, targetAngle));
    if (angleDiff <= FIRE_CONE_RAD && this.fireCooldown <= 0) {
      this.fireCooldown = params.fireInterval;
      return {
        dirX: Math.cos(this.aimAngle),
        dirY: Math.sin(this.aimAngle),
        target: this.target,
      };
    }

    return null;
  }

  /** Barrel tip position. */
  emitPoint(originX: number, originY: number, radius: number): { x: number; y: number } {
    return {
      x: originX + Math.cos(this.aimAngle) * radius,
      y: originY + Math.sin(this.aimAngle) * radius,
    };
  }

  private findBestTarget(
    ox: number,
    oy: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
  ): Phaser.Physics.Matter.Image | null {
    let best: Phaser.Physics.Matter.Image | null = null;
    let bestScore = Infinity;

    for (const chunk of chunks) {
      if (!chunk.active || chunk.getData('dead')) continue;
      const dist = Phaser.Math.Distance.Between(ox, oy, chunk.x, chunk.y);
      if (dist > MISSILE_RANGE) continue;

      const angle = Math.atan2(chunk.y - oy, chunk.x - ox);
      const angDiff = Math.abs(angleDelta(this.aimAngle, angle));
      const score = angDiff + (dist / MISSILE_RANGE) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = chunk;
      }
    }
    return best;
  }

  /**
   * Quadratic intercept: where to aim so missile meets the moving target.
   * Falls back to direct aim if no solution.
   */
  private leadIntercept(
    ox: number,
    oy: number,
    target: Phaser.Physics.Matter.Image,
    missileSpeed: number,
  ): { x: number; y: number } {
    const body = target.body as MatterJS.BodyType;
    const tvx = body.velocity.x;
    const tvy = body.velocity.y;
    const rx = target.x - ox;
    const ry = target.y - oy;

    // Quadratic: |relPos + targetVel*t|^2 = (missileSpeed*t)^2
    // Scale velocity from px/tick to px/s (Matter runs at ~60hz)
    const fps = 60;
    const vx = tvx * fps;
    const vy = tvy * fps;
    const a = vx * vx + vy * vy - missileSpeed * missileSpeed;
    const b = 2 * (rx * vx + ry * vy);
    const c = rx * rx + ry * ry;

    let t = 0;
    if (Math.abs(a) < 0.001) {
      // Linear case
      if (Math.abs(b) > 0.001) t = -c / b;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        const t1 = (-b - sqrtDisc) / (2 * a);
        const t2 = (-b + sqrtDisc) / (2 * a);
        if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
        else if (t1 > 0) t = t1;
        else if (t2 > 0) t = t2;
      }
    }

    t = Phaser.Math.Clamp(t, 0, 5);

    return {
      x: target.x + vx * t,
      y: target.y + vy * t,
    };
  }
}

// ── Projectile ──────────────────────────────────────────────────────────

export class MissileProjectile {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  blastRadius: number;
  homing: number;
  target: Phaser.Physics.Matter.Image | null;
  age = 0;
  alive = true;

  constructor(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    speed: number,
    damage: number,
    blastRadius: number,
    homing: number,
    target: Phaser.Physics.Matter.Image,
  ) {
    this.x = x;
    this.y = y;
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = speed;
    this.damage = damage;
    this.blastRadius = blastRadius;
    this.homing = homing;
    this.target = target;
  }

  /**
   * Move the projectile. Returns a detonation point if it should explode,
   * or null if still in flight.
   */
  update(
    deltaMs: number,
    chunks: Set<Phaser.Physics.Matter.Image>,
    channelLeft: number,
    channelRight: number,
  ): { x: number; y: number } | null {
    const dt = deltaMs / 1000;
    this.age += dt;

    // ── timeout ──
    if (this.age >= MISSILE_MAX_LIFETIME_S) {
      this.alive = false;
      return { x: this.x, y: this.y };
    }

    // ── homing ──
    if (this.homing > 0 && this.target && this.target.active && !this.target.getData('dead')) {
      const toX = this.target.x - this.x;
      const toY = this.target.y - this.y;
      const len = Math.sqrt(toX * toX + toY * toY);
      if (len > 0.1) {
        const nx = toX / len;
        const ny = toY / len;
        const lerpAmt = this.homing * dt;
        this.dirX = this.dirX + (nx - this.dirX) * lerpAmt;
        this.dirY = this.dirY + (ny - this.dirY) * lerpAmt;
        // Re-normalize
        const dl = Math.sqrt(this.dirX * this.dirX + this.dirY * this.dirY);
        if (dl > 0.001) {
          this.dirX /= dl;
          this.dirY /= dl;
        }
      }
    }

    // ── move ──
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;

    // ── wall detonation ──
    if (this.x < channelLeft || this.x > channelRight || this.y < -100 || this.y > 800) {
      this.alive = false;
      return { x: this.x, y: this.y };
    }

    // ── contact detonation: AABB overlap with any live chunk ──
    const halfChunk = 6; // CHUNK_PIXEL_SIZE / 2
    for (const chunk of chunks) {
      if (!chunk.active || chunk.getData('dead')) continue;
      if (Math.abs(this.x - chunk.x) <= halfChunk && Math.abs(this.y - chunk.y) <= halfChunk) {
        this.alive = false;
        return { x: this.x, y: this.y };
      }
    }

    return null;
  }
}

// ── Shared math ─────────────────────────────────────────────────────────

function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

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
git add src/game/missile.ts
git commit -m "create MissileLauncher + MissileProjectile classes"
```

---

### Task 4: Wire missile into GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add imports and fields**

Add import:
```typescript
import { MissileLauncher, MissileProjectile } from '../game/missile';
```

Add constant:
```typescript
const MISSILE_TURRET_SIZE = ARBOR_RADIUS * 2;
```

Extend `WeaponInstance`:
```typescript
interface WeaponInstance {
  id: string;
  type: string;
  sprite: Phaser.Physics.Matter.Image;
  orbitAngle: number;
  blades: Phaser.Physics.Matter.Image[];
  laser?: Laser;
  beamGfx?: Phaser.GameObjects.Graphics;
  missileLauncher?: MissileLauncher;
}
```

Add class fields for active projectiles:
```typescript
private missiles: Array<{ proj: MissileProjectile; image: Phaser.GameObjects.Rectangle }> = [];
```

- [ ] **Step 2: Add missile textures**

Add to the class, called from `preload()`:

```typescript
private makeMissileTexture(): void {
  const s = MISSILE_TURRET_SIZE;
  const g = this.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x224422);
  g.fillRect(0, 0, s, s);
  g.fillStyle(0x33ff33);
  g.fillRect(0, 0, s, 4);
  g.lineStyle(1, 0x336633);
  g.strokeRect(0.5, 0.5, s - 1, s - 1);
  g.generateTexture('missile-turret', s, s);
  g.destroy();
}
```

Call from `preload()`:
```typescript
this.makeMissileTexture();
```

- [ ] **Step 3: Update `spawnWeaponInstance` for missile type**

Update texture key:
```typescript
const texKey = typeId === 'saw' ? 'arbor'
  : typeId === 'laser' ? 'laser-turret'
  : typeId === 'missile' ? 'missile-turret'
  : typeId;
```

Add initialization after the laser block:
```typescript
if (typeId === 'missile') {
  instance.missileLauncher = new MissileLauncher(this.effectiveParams.missileFireInterval);
}
```

- [ ] **Step 4: Add missile update to the `update()` loop**

After the laser update block, add:

```typescript
for (const inst of this.weaponInstances) {
  if (inst.type === 'missile' && inst.missileLauncher) {
    this.updateMissileLauncher(inst, delta);
  }
}
this.updateMissileProjectiles(delta);
```

- [ ] **Step 5: Add `updateMissileLauncher` method**

```typescript
private updateMissileLauncher(inst: WeaponInstance, delta: number): void {
  const launcher = inst.missileLauncher!;
  const params = {
    fireInterval: this.effectiveParams.missileFireInterval,
    damage: this.effectiveParams.missileDamage,
    blastRadius: this.effectiveParams.missileBlastRadius,
    speed: this.effectiveParams.missileSpeed,
    homing: this.effectiveParams.missileHoming,
  };

  const fireCmd = launcher.update(delta, inst.sprite.x, inst.sprite.y, this.chunkImages, params);

  // Rotate sprite to aim direction.
  inst.sprite.setRotation(launcher.aimAngle + Math.PI / 2);

  if (fireCmd) {
    const emit = launcher.emitPoint(inst.sprite.x, inst.sprite.y, ARBOR_RADIUS);
    const proj = new MissileProjectile(
      emit.x, emit.y,
      fireCmd.dirX, fireCmd.dirY,
      params.speed, params.damage, params.blastRadius, params.homing,
      fireCmd.target,
    );
    const image = this.add.rectangle(emit.x, emit.y, 8, 4, 0x33ff33);
    image.setDepth(3);
    this.missiles.push({ proj, image });
  }
}
```

- [ ] **Step 6: Add `updateMissileProjectiles` method**

```typescript
private updateMissileProjectiles(delta: number): void {
  const halfW = this.scale.width / 2;
  const halfCh = this.effectiveParams.channelHalfWidth;
  const channelLeft = halfW - halfCh;
  const channelRight = halfW + halfCh;

  for (let i = this.missiles.length - 1; i >= 0; i--) {
    const m = this.missiles[i];
    const detonation = m.proj.update(delta, this.chunkImages, channelLeft, channelRight);

    if (detonation) {
      // AOE damage to all live chunks in blast radius.
      const r2 = m.proj.blastRadius * m.proj.blastRadius;
      for (const chunk of this.chunkImages) {
        if (!chunk.active || chunk.getData('dead')) continue;
        const dx = chunk.x - detonation.x;
        const dy = chunk.y - detonation.y;
        if (dx * dx + dy * dy <= r2) {
          const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
          if (asteroid) {
            asteroid.damageChunkByImage(chunk, m.proj.damage);
          }
        }
      }
      // Brief explosion flash.
      const flash = this.add.circle(detonation.x, detonation.y, m.proj.blastRadius, 0xff8833, 0.4);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.5,
        duration: 200,
        onComplete: () => flash.destroy(),
      });

      m.image.destroy();
      this.missiles.splice(i, 1);
    } else {
      // Update visual position and rotation.
      m.image.setPosition(m.proj.x, m.proj.y);
      m.image.setRotation(Math.atan2(m.proj.dirY, m.proj.dirX));
    }
  }
}
```

- [ ] **Step 7: Update cleanup**

In `onWeaponCountChanged` sell path, no change needed (missiles are fire-and-forget, not tied to instances).

In the `shutdown` handler, after the weapon instance cleanup loop, add:

```typescript
for (const m of this.missiles) m.image.destroy();
this.missiles = [];
```

- [ ] **Step 8: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, 52 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "wire missile into GameScene: launcher, projectiles, AOE, explosion"
```

---

### Task 5: Chrome verification

- [ ] **Step 1:** Open http://localhost:5173 — verify missile turret (dark green square) spawns in channel, spaced from saw and laser.
- [ ] **Step 2:** Verify launcher rotates toward chunks and fires a small green rectangle projectile.
- [ ] **Step 3:** Verify projectile flies toward chunks, detonates on contact with a brief orange flash.
- [ ] **Step 4:** Verify AOE: nearby live chunks take damage from explosion, dead chunks don't.
- [ ] **Step 5:** Verify upgrades via the M button: Fire Rate (shoots faster), Damage (kills faster), Blast Radius (bigger flash + more chunks hit), Speed (missiles fly faster), Homing (missiles curve toward target).
- [ ] **Step 6:** Check console for errors.

---

### Task 6: Update docs

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1:** Add missile done entry to Immediate Next. Remove missile from Phase 5 current todos.
- [ ] **Step 2:** Commit.

---

### Task 7: Code review

- [ ] **Step 1:** Dispatch fresh code reviewer agent. Check: lead intercept math, homing lerp normalization, AOE damage only hits live chunks, detonation cleanup, no leaked images, velocity px/tick to px/s conversion.
- [ ] **Step 2:** Address findings and commit.
