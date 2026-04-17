# Grinder Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded red death-line grinder with a proper `WeaponBehavior` — a row of counter-rotating rectangular blades that physically block & kill live chunks and pass dead chunks through. Adds kill-attribution plumbing so grinder kills pay flat $1 while weapon kills keep their tier-scaled reward.

**Architecture:** One `GrinderBehavior` singleton owning N blade bodies (static rectangles). Blades tile edge-to-edge across channel width and alternate rotation direction. Matter collision categories isolate dead chunks so they fall through blade bodies to the existing death-line collection. `damageLiveChunk` gains a `killerType` parameter; dead chunks carry the tag for collection-time reward branching.

**Tech Stack:** Phaser 3 + Matter.js, TypeScript, Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-16-grinder-overhaul-design.md`

---

## Phase 1 — Kill-attribution plumbing

Expand `damageLiveChunk` to record which weapon killed each chunk. Dead chunks carry the tag; collection branches reward on it. No gameplay behavior changes yet (grinder still uses the old death-line-chew, all weapons pay tier reward on collection as today).

### Task 1.1: Introduce `WeaponKillSource` type

**Files:**
- Modify: `src/game/compoundAsteroid.ts` (add exported type at top)

- [ ] **Step 1: Add the type**

At the top of `src/game/compoundAsteroid.ts`, after the existing imports, add:

```ts
export type WeaponKillSource = 'saw' | 'laser' | 'missile' | 'blackhole' | 'grinder';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/compoundAsteroid.ts
git commit -m "grinder: introduce WeaponKillSource type"
```

### Task 1.2: Extend `GameScene.damageLiveChunk` signature

**Files:**
- Modify: `src/scenes/GameScene.ts` (L365 method signature; L275 caller in grinder-line loop; L345 ChunkTarget damage callback)

- [ ] **Step 1: Update method signature**

At `src/scenes/GameScene.ts:365`, change:

```ts
damageLiveChunk(ast: CompoundAsteroid, chunkId: string, amount: number): boolean {
```

to:

```ts
damageLiveChunk(
  ast: CompoundAsteroid,
  chunkId: string,
  amount: number,
  killerType: WeaponKillSource,
): boolean {
```

Add `WeaponKillSource` to the `compoundAsteroid` import at the top of the file (find the existing `import type { CompoundAsteroid } from '../game/compoundAsteroid';` and change to:

```ts
import type { CompoundAsteroid, WeaponKillSource } from '../game/compoundAsteroid';
```

- [ ] **Step 2: Pass killerType into spawnDeadConfettiChunk**

At the body of `damageLiveChunk`, locate the line:

```ts
if (extracted) this.spawnDeadConfettiChunk(extracted);
```

Change it to:

```ts
if (extracted) this.spawnDeadConfettiChunk(extracted, killerType);
```

- [ ] **Step 3: Update the internal grinder-line caller at L275**

The `toGrind` loop will be deleted in Phase 6, but for now keep it functional. At L275 change:

```ts
const killed = this.damageLiveChunk(ast, id, Number.POSITIVE_INFINITY);
```

to:

```ts
const killed = this.damageLiveChunk(ast, id, Number.POSITIVE_INFINITY, 'grinder');
```

- [ ] **Step 4: Update the ChunkTarget damage callback at L345**

Change:

```ts
damage: (amount) => this.damageLiveChunk(ast, chunkId, amount),
```

to accept a killer type — `ChunkTarget.damage` is the surface blackhole uses. Update the callback shape at L345:

```ts
damage: (amount, killer) => this.damageLiveChunk(ast, chunkId, amount, killer),
```

- [ ] **Step 5: Update ChunkTarget type to accept killer in its damage callback**

Read `src/game/chunkTarget.ts` to see current type. Update the `damage` field on `ChunkTarget` to:

```ts
readonly damage: (amount: number, killer: WeaponKillSource) => boolean;
```

Add `import type { WeaponKillSource } from './compoundAsteroid';` at top of file.

- [ ] **Step 6: Typecheck — expect failures in other weapons**

Run: `npm run typecheck`
Expected: errors in sawBehavior.ts, laserBehavior.ts, missileBehavior.ts, blackholeBehavior.ts because they call the damage-callback or damageLiveChunk without a killer arg. That's fine — fixed next.

- [ ] **Step 7: Commit (partial — build will be broken briefly)**

```bash
git add src/scenes/GameScene.ts src/game/chunkTarget.ts
git commit -m "grinder: damageLiveChunk takes killerType (callers broken until task 1.3)"
```

### Task 1.3: Pass killer type from every weapon

**Files:**
- Modify: `src/game/weapons/sawBehavior.ts`
- Modify: `src/game/weapons/laserBehavior.ts`
- Modify: `src/game/weapons/missileBehavior.ts`
- Modify: `src/game/weapons/blackholeBehavior.ts`

- [ ] **Step 1: Saw — update internal interface + call**

In `src/game/weapons/sawBehavior.ts` L13–15, change the `SceneWithDamage` interface:

```ts
interface SceneWithDamage extends Phaser.Scene {
  damageLiveChunk(
    ast: CompoundAsteroid, chunkId: string, amount: number, killer: WeaponKillSource,
  ): boolean;
}
```

Add `WeaponKillSource` to the existing import: `import type { CompoundAsteroid, WeaponKillSource } from '../compoundAsteroid';`.

At L117 change:

```ts
const killed = sceneTyped.damageLiveChunk(asteroid, chunkId, params.sawDamage);
```

to:

```ts
const killed = sceneTyped.damageLiveChunk(asteroid, chunkId, params.sawDamage, 'saw');
```

- [ ] **Step 2: Laser — locate its damage call**

Run: `grep -n "damageLiveChunk\|\\.damage(" src/game/weapons/laserBehavior.ts`

For each hit, pass `'laser'` as the killer arg. The laser likely calls `chunk.damage(amount)` on a `ChunkTarget` — change to `chunk.damage(amount, 'laser')`.

- [ ] **Step 3: Missile**

Same for `src/game/weapons/missileBehavior.ts` — find `\.damage(` and add `, 'missile'`.

- [ ] **Step 4: Blackhole**

Same for `src/game/weapons/blackholeBehavior.ts` — find `\.damage(` and add `, 'blackhole'`.

- [ ] **Step 5: Typecheck clean**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Run existing tests**

Run: `npm test`
Expected: all 113 tests pass — no behavior changes yet, just types.

- [ ] **Step 7: Commit**

```bash
git add src/game/weapons/
git commit -m "grinder: thread killerType through saw/laser/missile/blackhole"
```

### Task 1.4: Tag dead chunks with killerType; branch collection reward

**Files:**
- Modify: `src/scenes/GameScene.ts` — `spawnDeadConfettiChunk` + `collectDeadAtDeathLine`

- [ ] **Step 1: Update spawnDeadConfettiChunk signature**

Locate `spawnDeadConfettiChunk` (around L392). Change signature:

```ts
private spawnDeadConfettiChunk(
  info: { ... existing ... },
  killerType: WeaponKillSource,
): void {
```

Inside the function, after other `setData` calls (e.g. after `chunk.setData('tier', info.material.tier);`), add:

```ts
chunk.setData('killerType', killerType);
```

- [ ] **Step 2: Update collectDeadAtDeathLine to branch reward**

Locate `collectDeadAtDeathLine` via:

Run: `grep -n "collectDeadAtDeathLine" src/scenes/GameScene.ts`

Read the current implementation (~20 lines). Locate the reward calculation (likely uses `tier` via `materialRewardFor` or similar). Branch:

```ts
const killerType = (chunk.getData('killerType') as WeaponKillSource | undefined) ?? 'saw';
const reward = killerType === 'grinder' ? 1 : /* existing tier-based reward */;
gameplayState.addCash(reward);
```

Preserve any existing stat counters (`cashFromSaw`, `collectedDead` etc.) by branching them the same way — or route all `killerType==='grinder'` into `cashFromLine` and everything else into `cashFromSaw` so existing debug text stays coherent.

- [ ] **Step 3: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: clean; existing tests pass.

- [ ] **Step 4: Dev-server smoke**

Run: `npm run dev` (background). Open http://127.0.0.1:5173 in Chrome. Play 30s. Confirm cash accrues, no console errors. Kill dev server.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "grinder: tag dead chunks with killerType; branch collection reward"
```

---

## Phase 2 — Collision filter infrastructure

Add Matter collision categories for grinder blades and dead chunks. Apply dead-chunk category in `spawnDeadConfettiChunk`. No blades exist yet — this is preparation.

### Task 2.1: Define collision category constants

**Files:**
- Create: `src/game/collisionCategories.ts`

- [ ] **Step 1: Create the file**

```ts
// Matter collision categories. Default category is 0x0001.
// Live chunks and weapons use default; new categories added here.
export const CAT_DEFAULT = 0x0001;
export const CAT_GRINDER_BLADE = 0x0008;
export const CAT_DEAD_CHUNK = 0x0010;

// Default mask: collide with everything (0xFFFFFFFF).
// Grinder blades collide with everything EXCEPT dead chunks.
export const MASK_GRINDER_BLADE = 0xFFFFFFFF & ~CAT_DEAD_CHUNK;
// Dead chunks collide with everything EXCEPT grinder blades.
export const MASK_DEAD_CHUNK = 0xFFFFFFFF & ~CAT_GRINDER_BLADE;
```

- [ ] **Step 2: Commit**

```bash
git add src/game/collisionCategories.ts
git commit -m "grinder: define collision categories for blade/dead-chunk filter"
```

### Task 2.2: Apply dead-chunk category on spawn

**Files:**
- Modify: `src/scenes/GameScene.ts` — `spawnDeadConfettiChunk`

- [ ] **Step 1: Add the filter at spawn**

Import at the top:

```ts
import { CAT_DEAD_CHUNK, MASK_DEAD_CHUNK } from '../game/collisionCategories';
```

Inside `spawnDeadConfettiChunk`, after `chunk.setData(...)` calls and after the body is fully configured (e.g. after `chunk.setRectangle`, `setMass`, etc.), set the collision filter:

```ts
chunk.setCollisionCategory(CAT_DEAD_CHUNK);
chunk.setCollidesWith(MASK_DEAD_CHUNK);
```

- [ ] **Step 2: Typecheck + tests + smoke**

Run: `npm run typecheck && npm test`
Expected: clean, 113 pass.

Run dev server, play 30s in Chrome, confirm no regressions (dead chunks still collide with walls & each other, still collected at death line).

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "grinder: apply dead-chunk collision category on spawn"
```

---

## Phase 3 — `GrinderBehavior` skeleton

Create the behavior file. Spawn blade bodies at scene start. Rotate them. No collision routing yet — blades exist but are invisible to `handleContact` because `otherKind !== 'grinder'`.

### Task 3.1: Extend catalog with 3 grinder upgrades (with placeholder growth)

**Files:**
- Modify: `src/game/weaponCatalog.ts` — grinder `upgrades: []`

- [ ] **Step 1: Add the upgrades**

At `src/game/weaponCatalog.ts:26`, replace `upgrades: [],` with:

```ts
upgrades: [
  { id: 'grinder.damage',    name: 'Grinder Damage', description: '+damage per blade contact', category: 'grinder', baseCost: 1, growthRate: 1, maxLevel: 20 },
  { id: 'grinder.spinSpeed', name: 'Spin Speed',     description: 'Blades spin faster',         category: 'grinder', baseCost: 1, growthRate: 1, maxLevel: 10 },
  { id: 'grinder.bladeSize', name: 'Blade Size',     description: 'Taller blades reach higher', category: 'grinder', baseCost: 1, growthRate: 1, maxLevel: 8 },
],
```

- [ ] **Step 2: Update `weaponCatalog.test.ts`**

Read the test file. Find any assertion about grinder upgrades being empty. Replace with expectation of 3 upgrades. Add an assertion:

```ts
it('grinder has damage, spinSpeed, bladeSize upgrades', () => {
  const grinder = findWeaponType('grinder');
  const ids = grinder!.upgrades.map((u) => u.id);
  expect(ids).toEqual(['grinder.damage', 'grinder.spinSpeed', 'grinder.bladeSize']);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass (new test too).

- [ ] **Step 4: Commit**

```bash
git add src/game/weaponCatalog.ts src/game/weaponCatalog.test.ts
git commit -m "grinder: add damage/spinSpeed/bladeSize upgrade defs"
```

### Task 3.2: Extend `EffectiveGameplayParams` and applier

**Files:**
- Modify: `src/game/upgradeApplier.ts`
- Modify: `src/game/upgradeApplier.test.ts`

Initial tuning values mirror the saw for first-pass feel; user will tune after first live Chrome play-test (Phase 7).

- [ ] **Step 1: Add fields to type + BASE_PARAMS**

In `src/game/upgradeApplier.ts` extend `EffectiveGameplayParams`:

```ts
readonly grinderDamage: number;
readonly grinderSpinSpeed: number; // rad/sec magnitude
readonly grinderBladeScale: number; // multiplier on base blade dimensions
```

Extend `BASE_PARAMS`:

```ts
grinderDamage: 1,
grinderSpinSpeed: 2.0, // rad/sec; placeholder — tune after live play
grinderBladeScale: 1,
```

Add per-level constants:

```ts
const GRINDER_DAMAGE_PER_LEVEL = 1;
const GRINDER_SPIN_SPEED_PER_LEVEL = 0.4;
const GRINDER_BLADE_SCALE_PER_LEVEL = 0.1;
```

Extend the `applyUpgrades` return object:

```ts
grinderDamage: BASE_PARAMS.grinderDamage + lv('grinder.damage') * GRINDER_DAMAGE_PER_LEVEL,
grinderSpinSpeed: BASE_PARAMS.grinderSpinSpeed + lv('grinder.spinSpeed') * GRINDER_SPIN_SPEED_PER_LEVEL,
grinderBladeScale: BASE_PARAMS.grinderBladeScale + lv('grinder.bladeSize') * GRINDER_BLADE_SCALE_PER_LEVEL,
```

- [ ] **Step 2: Add applier tests**

In `src/game/upgradeApplier.test.ts` add:

```ts
it('grinder.damage level scales grinderDamage', () => {
  const p = applyUpgrades({ 'grinder.damage': 3 });
  expect(p.grinderDamage).toBe(BASE_PARAMS.grinderDamage + 3);
});

it('grinder.spinSpeed level scales grinderSpinSpeed', () => {
  const p = applyUpgrades({ 'grinder.spinSpeed': 2 });
  expect(p.grinderSpinSpeed).toBeCloseTo(BASE_PARAMS.grinderSpinSpeed + 2 * 0.4, 5);
});

it('grinder.bladeSize level scales grinderBladeScale', () => {
  const p = applyUpgrades({ 'grinder.bladeSize': 4 });
  expect(p.grinderBladeScale).toBeCloseTo(BASE_PARAMS.grinderBladeScale + 4 * 0.1, 5);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: new tests pass; all 116 tests total. **Remember to bump "113 vitest" count to 116 in `CLAUDE.md` in the final docs pass (Phase 8).**

- [ ] **Step 4: Commit**

```bash
git add src/game/upgradeApplier.ts src/game/upgradeApplier.test.ts
git commit -m "grinder: wire damage/spin/scale into EffectiveGameplayParams"
```

### Task 3.3: Create `GrinderBehavior` file with rotation — no collision yet

**Files:**
- Create: `src/game/weapons/grinderBehavior.ts`

- [ ] **Step 1: Create the file**

```ts
import Phaser from 'phaser';
import type { ChunkTarget } from '../chunkTarget';
import type { CompoundAsteroid } from '../compoundAsteroid';
import type { EffectiveGameplayParams } from '../upgradeApplier';
import type { WeaponBehavior, WeaponRawAccess } from './weaponBehavior';
import {
  CAT_GRINDER_BLADE,
  MASK_GRINDER_BLADE,
} from '../collisionCategories';

const BLADE_WIDTH_BASE = 40;
const BLADE_HEIGHT_BASE = 28;
const GRINDER_CLEARANCE = 4; // gap between blade bottom edge and death line

interface Blade {
  body: MatterJS.BodyType;
  sprite: Phaser.GameObjects.Image;
  direction: 1 | -1;
}

interface SceneWithMatter extends Phaser.Scene {
  matter: Phaser.Physics.Matter.MatterPhysics;
}

export class GrinderBehavior implements WeaponBehavior {
  readonly textureKey = 'grinder-housing';
  readonly bodyRadius = 1; // symbolic — housing isn't a physics body

  private blades: Blade[] = [];
  private omega = 0;      // rad/sec magnitude
  private damage = 1;
  private bladeScale = 1;
  private channelWidth = 0;
  private deathLineY = 0;
  private channelCenterX = 0;
  private instanceId: string | undefined;
  private bladeTextureKey = 'grinder-blade';

  constructor(opts: { deathLineY: number; channelCenterX: number }) {
    this.deathLineY = opts.deathLineY;
    this.channelCenterX = opts.channelCenterX;
  }

  createTextures(scene: Phaser.Scene): void {
    this.makeBladeTexture(scene);
    if (!scene.textures.exists('grinder-housing')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x2a2d33);
      g.fillRect(0, 0, 8, 8);
      g.generateTexture('grinder-housing', 8, 8);
      g.destroy();
    }
  }

  init(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, params: EffectiveGameplayParams): void {
    this.instanceId = sprite.getData('instanceId') as string | undefined;
    this.omega = params.grinderSpinSpeed;
    this.damage = params.grinderDamage;
    this.bladeScale = params.grinderBladeScale;
    this.channelWidth = params.channelHalfWidth * 2;
    this.retile(scene);
  }

  update(
    scene: Phaser.Scene,
    _sprite: Phaser.Physics.Matter.Image,
    delta: number,
    _chunks: readonly ChunkTarget[],
    _params: EffectiveGameplayParams,
    _raw?: WeaponRawAccess,
  ): void {
    const dt = delta / 1000;
    const Matter = (scene as SceneWithMatter).matter.body;
    for (const blade of this.blades) {
      const newAngle = blade.body.angle + blade.direction * this.omega * dt;
      Matter.setAngle(blade.body, newAngle);
      blade.sprite.setRotation(newAngle);
    }
  }

  onUpgrade(
    scene: Phaser.Scene,
    _sprite: Phaser.Physics.Matter.Image,
    prev: EffectiveGameplayParams,
    next: EffectiveGameplayParams,
  ): void {
    this.omega = next.grinderSpinSpeed;
    this.damage = next.grinderDamage;
    const widthChanged = next.channelHalfWidth !== prev.channelHalfWidth;
    const scaleChanged = next.grinderBladeScale !== prev.grinderBladeScale;
    if (widthChanged || scaleChanged) {
      this.bladeScale = next.grinderBladeScale;
      this.channelWidth = next.channelHalfWidth * 2;
      this.retile(scene);
    }
  }

  destroy(): void {
    for (const blade of this.blades) {
      blade.sprite.destroy();
      // body destruction handled when we remove from world — see teardown below
    }
    this.blades = [];
  }

  // handleCompoundHit added in Task 3.5 once routing is wired.

  private retile(scene: Phaser.Scene): void {
    // Tear down existing blades.
    const matter = (scene as SceneWithMatter).matter;
    for (const blade of this.blades) {
      blade.sprite.destroy();
      matter.world.remove(blade.body);
    }
    this.blades = [];

    const bladeW = BLADE_WIDTH_BASE * this.bladeScale;
    const bladeH = BLADE_HEIGHT_BASE * this.bladeScale;
    const n = Math.max(1, Math.ceil(this.channelWidth / bladeW));
    const actualW = this.channelWidth / n;
    const centerY = this.deathLineY - bladeH / 2 - GRINDER_CLEARANCE;
    const leftX = this.channelCenterX - this.channelWidth / 2;

    for (let i = 0; i < n; i++) {
      const cx = leftX + actualW * (i + 0.5);
      const body = matter.add.rectangle(cx, centerY, actualW, bladeH, {
        isStatic: true,
        collisionFilter: {
          category: CAT_GRINDER_BLADE,
          mask: MASK_GRINDER_BLADE,
        },
      }) as unknown as MatterJS.BodyType;
      // Tag for collision routing in handleContact.
      (body as unknown as { plugin: Record<string, unknown> }).plugin = {
        kind: 'grinder',
        instanceId: this.instanceId,
      };
      const sprite = scene.add.image(cx, centerY, this.bladeTextureKey);
      sprite.setDisplaySize(actualW, bladeH);
      sprite.setDepth(1);
      this.blades.push({
        body,
        sprite,
        direction: i % 2 === 0 ? 1 : -1,
      });
    }
  }

  private makeBladeTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(this.bladeTextureKey)) return;
    const w = 64;
    const h = 48;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x4a4e58); // body
    g.fillRect(0, 0, w, h);
    g.fillStyle(0x7a818c); // midline stripe (25% of height, centered)
    const stripeH = Math.floor(h * 0.25);
    g.fillRect(0, (h - stripeH) / 2, w, stripeH);
    g.lineStyle(1, 0x2a2d33);
    g.strokeRect(0, 0, w, h);
    g.generateTexture(this.bladeTextureKey, w, h);
    g.destroy();
  }

  get stats() {
    return { blades: this.blades.length };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. File is imported nowhere yet, so no runtime impact.

- [ ] **Step 3: Commit**

```bash
git add src/game/weapons/grinderBehavior.ts
git commit -m "grinder: GrinderBehavior skeleton — blade tile, rotation, no routing"
```

### Task 3.4: Spawn a single GrinderBehavior instance in GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts` — import, spawn, register in weaponInstances

- [ ] **Step 1: Locate the weapon-spawn logic**

Run: `grep -n "spawnWeaponInstance\|weaponInstances" src/scenes/GameScene.ts | head -30`

Find where weapons are constructed in `create()` (around L116 based on earlier exploration). The existing filter is `WEAPON_TYPES.filter((w) => !w.locked && w.id !== 'grinder')` — this excludes grinder. We add grinder spawning as a separate dedicated call.

- [ ] **Step 2: Add import**

Top of `src/scenes/GameScene.ts`:

```ts
import { GrinderBehavior } from '../game/weapons/grinderBehavior';
```

- [ ] **Step 3: Spawn grinder in create()**

After the existing weapon loop (the one that filters out grinder), before the cash/UI launch, add:

```ts
this.spawnGrinder();
```

Add the method on `GameScene`:

```ts
private spawnGrinder(): void {
  const halfW = this.scale.width / 2;
  const behavior = new GrinderBehavior({
    deathLineY: DEATH_LINE_Y,
    channelCenterX: halfW,
  });
  behavior.createTextures(this);
  // Create a dummy off-screen sprite to satisfy WeaponBehavior's sprite param.
  const hiddenSprite = this.matter.add.image(-9999, -9999, 'grinder-housing', undefined, {
    isStatic: true,
    isSensor: true,
  });
  hiddenSprite.setVisible(false);
  hiddenSprite.setData('kind', 'grinder-root');
  const instanceId = `grinder-0`;
  hiddenSprite.setData('instanceId', instanceId);
  behavior.init(this, hiddenSprite, this.effectiveParams);
  this.weaponInstances.push({
    id: instanceId,
    typeId: 'grinder',
    sprite: hiddenSprite,
    behavior,
  } as WeaponInstance);
}
```

Note the dummy sprite: Phaser's saw/laser/etc. pattern assumes a visible draggable sprite. Grinder has no single sprite (it's the row). The hidden sprite satisfies the interface without colliding (sensor + off-screen).

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 5: Chrome smoke**

Run `npm run dev` (background). Open http://127.0.0.1:5173. Verify: blades visible at channel bottom, rotating, alternating directions. Existing saw still kills chunks (falling onto blades will stack since routing not wired yet — that's expected). Close dev server.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "grinder: spawn GrinderBehavior instance; rotating blades visible"
```

### Task 3.5: Wire collision routing — blades damage live chunks

**Files:**
- Modify: `src/game/weapons/grinderBehavior.ts` — add `handleCompoundHit`
- Modify: `src/scenes/GameScene.ts` — extend `handleContact` to accept `'grinder'` kind

- [ ] **Step 1: Implement handleCompoundHit in GrinderBehavior**

Add to `GrinderBehavior` (mirror SawBehavior's pattern — per-asteroid cooldown, kill attribution):

```ts
private lastHitAt = new Map<string, number>();
private lastPruneAt = 0;
private hitCount = 0;
private killCount = 0;

handleCompoundHit(
  asteroid: CompoundAsteroid,
  chunkId: string,
  _weaponBody: MatterJS.BodyType,
  _params: EffectiveGameplayParams,
  scene: Phaser.Scene,
): { hit: boolean; killed: boolean } {
  const now = scene.time.now;
  // Prune periodically (same pattern as saw).
  if (now - this.lastPruneAt >= 1000) {
    const cutoff = now - 1000;
    for (const [key, t] of this.lastHitAt) {
      if (t < cutoff) this.lastHitAt.delete(key);
    }
    this.lastPruneAt = now;
  }
  const key = `${asteroid.id}/${chunkId}`;
  const last = this.lastHitAt.get(key) ?? -Infinity;
  const GRINDER_HIT_COOLDOWN_MS = 120;
  if (now - last < GRINDER_HIT_COOLDOWN_MS) return { hit: false, killed: false };
  this.lastHitAt.set(key, now);

  const sceneTyped = scene as Phaser.Scene & {
    damageLiveChunk: (
      ast: CompoundAsteroid, id: string, amount: number, killer: 'grinder',
    ) => boolean;
  };
  const killed = sceneTyped.damageLiveChunk(asteroid, chunkId, this.damage, 'grinder');
  this.hitCount++;
  if (killed) this.killCount++;
  return { hit: true, killed };
}
```

- [ ] **Step 2: Extend GameScene.handleContact at L718**

Current code at L718:

```ts
if (otherKind !== 'saw') return;
```

Change to:

```ts
if (otherKind !== 'saw' && otherKind !== 'grinder') return;
```

The blade body has `plugin.kind = 'grinder'` and `plugin.instanceId = this.instanceId` from Task 3.3 retile code. But `handleContact` today reads `goOther.getData('kind')` — that reads from `gameObject`, not `plugin`. Blade bodies created via `matter.add.rectangle` don't have a gameObject.

Mitigation: route grinder hits via `plugin.kind` when no `gameObject` is present. Rewrite the relevant branch in `handleContact`:

```ts
let otherKind: string | undefined;
let instanceId: string | undefined;
const pluginOther = (otherPart as unknown as { plugin?: { kind?: string; instanceId?: string } }).plugin;
if (goOther) {
  otherKind = goOther.getData?.('kind') as string | undefined;
  instanceId = goOther.getData?.('instanceId') as string | undefined;
} else if (pluginOther?.kind) {
  otherKind = pluginOther.kind;
  instanceId = pluginOther.instanceId;
}
if (otherKind !== 'saw' && otherKind !== 'grinder') return;
if (!instanceId) return;
```

(Replace the existing lines that set `otherKind` and `instanceId`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Chrome smoke**

Run `npm run dev`. In Chrome, play 60s. Confirm: live chunks hitting grinder blades take damage (chunks killed on contact with blade, corpse falls through, collected at line for $1). Saw kills pay tier reward (confirm cash ticks up faster when saw kills high-tier chunks vs grinder-only). No console errors.

If live chunks pile on top of blades without being killed, debug: likely collision filter issue or routing miss. Check `handleContact` with a console.log during pair processing.

- [ ] **Step 5: Commit**

```bash
git add src/game/weapons/grinderBehavior.ts src/scenes/GameScene.ts
git commit -m "grinder: route blade contacts through WeaponBehavior; kills pay $1"
```

---

## Phase 4 — Remove legacy grinder-line loop; reorder death-line depth

Now that blades do the killing, the old `DEATH_LINE_Y`-below chew loop is redundant. Remove it. Also depth-reorder the red strip to sit behind blades.

### Task 4.1: Delete toGrind live-chunk loop

**Files:**
- Modify: `src/scenes/GameScene.ts` — L268–281

- [ ] **Step 1: Delete the loop**

Locate the block at L268–281:

```ts
// Grinder line: any chunk part below DEATH_LINE_Y gets chewed.
const toGrind: string[] = [];
for (const chunk of ast.chunks.values()) {
  if (chunk.bodyPart.position.y > DEATH_LINE_Y) toGrind.push(chunk.chunkId);
}
for (const id of toGrind) {
  const killed = this.damageLiveChunk(ast, id, Number.POSITIVE_INFINITY, 'grinder');
  if (killed) {
    gameplayState.addCash(1);
    this.cashFromLine += 1;
    this.collectedAlive++;
  }
}
```

Delete all of it. `damageLiveChunk` now only fires via weapon `handleCompoundHit` routes.

- [ ] **Step 2: Chrome smoke**

Run `npm run dev`. Play 60s in Chrome. Verify: chunks still die (now only via grinder blades). No chunks pile past the blades (if they do, the death line is the backstop — which is currently visible and would be hit).

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "grinder: remove legacy DEATH_LINE_Y chew loop (blades do the work)"
```

### Task 4.2: Depth-reorder death-line strip behind blades

**Files:**
- Modify: `src/scenes/GameScene.ts` — L432 death-line rectangle creation

- [ ] **Step 1: Set depth on the red strip**

Locate:

```ts
this.add.rectangle(width / 2, DEATH_LINE_Y, width, 6, 0xff3355, 0.9).setOrigin(0.5);
```

Change to:

```ts
this.add.rectangle(width / 2, DEATH_LINE_Y, width, 6, 0xff3355, 0.9).setOrigin(0.5).setDepth(-1);
```

Blade sprites already `setDepth(1)` in GrinderBehavior.retile. This puts the red strip behind blades without affecting chunk sprites (default depth 0, still above strip).

- [ ] **Step 2: Chrome smoke — visually confirm**

Dev server, play in Chrome. Red strip mostly hidden by blades / housing; visible only in the gaps. If a live chunk ever reaches the strip during gameplay, it's a bug — flag and investigate.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "grinder: move death-line strip behind blade sprites"
```

---

## Phase 5 — UI panel wiring

Grinder has upgrades in the catalog (Phase 3.1) but the UI gate at `UIScene.ts:375` hides them. Unhide.

### Task 5.1: Unhide grinder upgrade panel

**Files:**
- Modify: `src/scenes/UIScene.ts` — L375 gate

- [ ] **Step 1: Remove the grinder exclusion from the upgrade-list gate**

Find L375:

```ts
if (isWeapon && !this.isLocked && def.id !== 'grinder') {
```

Change to:

```ts
if (isWeapon && !this.isLocked) {
```

Buy/sell gate at L439 (`showBuySell = isWeapon && def.id !== 'grinder'`) stays as-is.

- [ ] **Step 2: Chrome verify**

Dev server. In Chrome, click the grinder tab. Confirm: upgrade buttons appear (Grinder Damage, Spin Speed, Blade Size). Buy a level of Spin Speed — blades spin visibly faster. Buy a level of Grinder Damage — chunks die faster on contact. Buy a level of Blade Size — blades taller; retile triggers; count adjusts if blades overflow.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "grinder: unhide upgrade panel in UIScene"
```

---

## Phase 6 — Tests

Add unit tests for tiling math & e2e extension for the grinder.

### Task 6.1: Unit test for blade tiling

**Files:**
- Create: `src/game/weapons/grinderBehavior.test.ts`

The tiling math in `retile` is `n = max(1, ceil(channelWidth / bladeW))`. Expose it as a pure helper for testing.

- [ ] **Step 1: Extract pure tiling helper**

In `grinderBehavior.ts` add at module scope:

```ts
export function computeBladeLayout(
  channelWidth: number,
  bladeScale: number,
): { n: number; actualWidth: number } {
  const bladeW = BLADE_WIDTH_BASE * bladeScale;
  const n = Math.max(1, Math.ceil(channelWidth / bladeW));
  return { n, actualWidth: channelWidth / n };
}
```

Replace the inline math in `retile` with:

```ts
const { n, actualWidth: actualW } = computeBladeLayout(this.channelWidth, this.bladeScale);
const bladeH = BLADE_HEIGHT_BASE * this.bladeScale;
```

- [ ] **Step 2: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import { computeBladeLayout } from './grinderBehavior';

describe('computeBladeLayout', () => {
  it('spans channel width with tiled blades', () => {
    const { n, actualWidth } = computeBladeLayout(240, 1);
    expect(n).toBe(Math.ceil(240 / 40));
    expect(actualWidth).toBeCloseTo(240 / n, 5);
  });

  it('scales blade count with width', () => {
    const narrow = computeBladeLayout(80, 1);
    const wide = computeBladeLayout(400, 1);
    expect(wide.n).toBeGreaterThan(narrow.n);
  });

  it('honours bladeScale — larger blades, fewer of them', () => {
    const small = computeBladeLayout(240, 1);
    const big = computeBladeLayout(240, 2);
    expect(big.n).toBeLessThanOrEqual(small.n);
  });

  it('always returns at least 1 blade', () => {
    expect(computeBladeLayout(0, 1).n).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all tests pass; total count now 120 (was 113 → +3 applier tests in 3.2 +1 catalog test in 3.1 +4 tiling tests in 6.1 - wait: recount).

Actually recount: original 113 + 3 applier (3.2) + 1 catalog (3.1) + 4 tiling = 121. Note the exact number after running and use that in Phase 8 docs update.

- [ ] **Step 4: Commit**

```bash
git add src/game/weapons/grinderBehavior.ts src/game/weapons/grinderBehavior.test.ts
git commit -m "grinder: pure tiling helper + unit tests"
```

### Task 6.2: Extend Playwright smoke test

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Read existing test**

Run: `cat tests/e2e/smoke.spec.ts`

Understand current assertions. Add a new assertion block AFTER the existing "saw hits > 0" wait:

```ts
// Grinder: verify at least one blade exists and has rotated.
const bladeInfo = await page.evaluate(() => {
  const g = (window as unknown as { __GAME__?: { scene: { scenes: unknown[] } } }).__GAME__;
  if (!g) return null;
  const gameScene = g.scene.scenes.find(
    (s: { scene: { key: string } }) => s.scene.key === 'game',
  ) as { weaponInstances?: Array<{ typeId: string; behavior: { stats?: { blades?: number } } }> } | undefined;
  const grinder = gameScene?.weaponInstances?.find((w) => w.typeId === 'grinder');
  return { bladeCount: grinder?.behavior.stats?.blades ?? 0 };
});
expect(bladeInfo?.bladeCount).toBeGreaterThan(0);
```

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e`
Expected: smoke passes (grinder blade assertion green, existing assertions still green).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke.spec.ts
git commit -m "grinder: smoke e2e asserts blade presence"
```

---

## Phase 7 — Live tuning with user

Before shipping, run the game in Chrome and ask the user for tuning values based on feel. Per the "gameplay tuning is sacrosanct" rule, placeholder values in `upgradeApplier.ts` are provisional.

### Task 7.1: Play the game, collect tuning feedback

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (background).

- [ ] **Step 2: Open Chrome via MCP to http://127.0.0.1:5173**

Take a screenshot. Play 60s. Observe:
- Base spin speed (too fast / too slow / fine?).
- Base blade size proportions (too tall / too short?).
- Base grinder damage — is L0 grinder plausibly killing L1 chunks, or letting them pile? Should L0 grinder be survivable for a few hits to encourage weapons buying?

- [ ] **Step 3: Ask user for tuning values**

Report observations. Ask for:
- `BASE_GRINDER_DAMAGE` (currently 1)
- `BASE_GRINDER_SPIN` (currently 2.0 rad/s)
- `BLADE_WIDTH_BASE` / `BLADE_HEIGHT_BASE` (currently 40 / 28)
- `GRINDER_CLEARANCE` (currently 4)
- Per-level growths: `GRINDER_DAMAGE_PER_LEVEL` (1), `GRINDER_SPIN_SPEED_PER_LEVEL` (0.4), `GRINDER_BLADE_SCALE_PER_LEVEL` (0.1)

One at a time, yes/no or value per global CLAUDE.md.

- [ ] **Step 4: Apply tuning values**

Update constants in `upgradeApplier.ts` and `grinderBehavior.ts` as user specifies.

- [ ] **Step 5: Re-verify in Chrome**

Fresh play session; confirm feel matches intent. Screenshot to share with user.

- [ ] **Step 6: Commit**

```bash
git add src/game/upgradeApplier.ts src/game/weapons/grinderBehavior.ts
git commit -m "grinder: tune base values + per-level growth"
```

---

## Phase 8 — Code review (fresh reviewer)

Dispatch a fresh `code-reviewer` agent with no implementation bias.

### Task 8.1: Fresh-agent code review

- [ ] **Step 1: Run the build & tests**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 2: Dispatch reviewer**

Use the Agent tool with `subagent_type: "superpowers:code-reviewer"`. Prompt:

> Review the grinder-overhaul branch (`feature/grinder-overhaul`) against the spec at `docs/superpowers/specs/2026-04-16-grinder-overhaul-design.md`. Focus on:
> 1. Correctness of the collision-filter mechanism — do dead chunks genuinely skip blade collisions? Is the filter set early enough that no mid-death pair misses the mask?
> 2. Kill-attribution correctness — trace one full "saw chips chunk → grinder finishes" path and one "saw kills chunk → dead chunk passes grinder → collected" path. Confirm reward math is correct and no double-pay.
> 3. Retile lifecycle — when Channel Width or Blade Size upgrades trigger `onUpgrade`, are old blade bodies cleaned up from Matter's world? Any leak risk?
> 4. Consistency with `DESIGN_INVARIANTS.md` and existing saw-blade patterns.
> 5. Anything in GameScene.ts that should've been extracted but was left inline because it was convenient.
> Report findings. Don't fix.

- [ ] **Step 3: Triage findings**

For each reviewer-raised issue:
- **Confirmed bug** → fix, commit as `fix(grinder): <issue>`.
- **Valid critique, non-blocking** → add to ROADMAP or DESIGN_INVARIANTS, move on.
- **Reviewer is wrong** → note why, move on.

- [ ] **Step 4: Commit any fixes**

Standard TDD: failing test (if applicable) → fix → passing test → commit.

---

## Phase 9 — Docs + live deploy verification + FF merge

Ship.

### Task 9.1: Update documentation

**Files:**
- Modify: `DESIGN_INVARIANTS.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Add grinder invariants**

In `DESIGN_INVARIANTS.md` add a new section:

```markdown
## Grinder

- **Grinder kills pay flat $1.** Other weapons pay tier-scaled reward. Attribution = last-hit via `killerType` tag on dead chunks, read in `collectDeadAtDeathLine`. New weapons must pass their type into `damageLiveChunk(..., killerType)`.
- **Counter-rotating blades are load-bearing.** Alternating blades spin opposite directions. Don't unify direction — the chewing feel comes from opposing-face friction on chunks resting between blades.
- **Dead chunks carry `CAT_DEAD_CHUNK` category and pass through grinder blades.** Live chunks collide. Set the filter in `spawnDeadConfettiChunk` — missing this locks corpses on top of blades.
- **Grinder width always = channel width.** Blade Size scales blade dimensions; Channel Width upgrade triggers retile. Don't introduce a separate grinder-width constant.
- **Grinder blades are static bodies with `plugin.kind = 'grinder'`.** No `gameObject` set (bodies created via `matter.add.rectangle`, not `matter.add.image`) — collision handler reads `plugin.kind` as a fallback when `gameObject` is absent.
```

- [ ] **Step 2: Update CLAUDE.md test count**

Find `113 tests across 10 files` in `CLAUDE.md`. Replace with actual current count from `npm test` output.

Also append grinderBehavior to the tree under `src/game/weapons/`:

```
│       │   ├── grinderBehavior.ts
```

- [ ] **Step 3: Update README feature list**

Add a bullet to README.md near where weapons are enumerated:

- Grinder with rotating blades, upgradeable (damage, spin speed, blade size), flat $1 payout.

- [ ] **Step 4: Mark ROADMAP §3 grinder as done**

In `ROADMAP.md` change the grinder bullet to:

```markdown
- ✅ **Grinder overhaul.** Shipped 2026-04-16. Rewrote the red-line death boundary as a `GrinderBehavior` with a row of counter-rotating rectangular blades tiled across the channel bottom. Live chunks collide with blades; dead chunks pass through via collision filter (`CAT_DEAD_CHUNK`). Three upgrades (Damage / Spin Speed / Blade Size). Flat $1 payout preserved via `killerType` attribution on dead chunks — weapon kills still pay tier-scaled. Death line strip retained as visual failsafe behind blades.
```

Keep the sub-bullets that are still open (none — all three were in scope).

- [ ] **Step 5: Commit docs**

```bash
git add DESIGN_INVARIANTS.md CLAUDE.md README.md ROADMAP.md
git commit -m "docs: grinder overhaul — invariants, readme, roadmap"
```

### Task 9.2: FF-merge to main and deploy

- [ ] **Step 1: Final green check**

Run: `npm run typecheck && npm test && npm run build && npm run test:e2e`
Expected: all green.

- [ ] **Step 2: Push branch to origin (backup)**

```bash
git push -u origin feature/grinder-overhaul
```

- [ ] **Step 3: Ask user for explicit permission to FF-merge**

Per global CLAUDE.md: FF-merge only after user verifies locally. Ask: "Branch tested locally? OK to FF-merge `feature/grinder-overhaul` → `main` and push?"

Wait for explicit yes.

- [ ] **Step 4: FF-merge + push**

```bash
git checkout main
git merge --ff-only feature/grinder-overhaul
git push origin main
```

- [ ] **Step 5: Wait for GitHub Pages deploy**

Deploy workflow runs on every push to main. Monitor via `gh run watch` or just wait ~90s.

- [ ] **Step 6: Live validation in Chrome**

Open https://muwamath.github.io/asteroid-grinder/ in Chrome. Watch console for errors. Play 60s. Confirm: grinder visible & rotating, blades kill chunks, dead chunks collected, upgrade panel functional. Screenshot for the user.

- [ ] **Step 7: Delete feature branch (local + remote)**

```bash
git branch -d feature/grinder-overhaul
git push origin --delete feature/grinder-overhaul
```

---

## Self-review — done

- Spec coverage: §1 arch → Phases 3–4. §2 physics/filter → Phase 2 + 3.3 + 3.5. §3 attribution → Phase 1. §4 upgrades → Phases 3.1, 3.2, 5. §5 visuals → 3.3 texture + 4.2 depth + 7 tune. §6 testing → Phase 6 + DESIGN_INVARIANTS in 9.1.
- Placeholder scan: only TBD-flavored items are the intentional Phase 7 tuning values, which are placeholders explicitly per the gameplay-tuning-sacrosanct rule.
- Type consistency: `damageLiveChunk(ast, id, amount, killer)` signature used throughout. `WeaponKillSource` exported from `compoundAsteroid.ts`. `EffectiveGameplayParams.grinderDamage/grinderSpinSpeed/grinderBladeScale` consistent in applier, applier tests, GrinderBehavior.
