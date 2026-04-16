# Compound-Body Asteroid Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-chunk welded Matter bodies with one compound Matter body per asteroid. Killing a chunk extracts it as a loose confetti chunk; when killing disconnects the live-chunk graph, the asteroid splits into N new independent compound bodies.

**Architecture:** Pure graph helper (`asteroidGraph.ts`) owns the split math. A new `CompoundAsteroid` class (`compoundAsteroid.ts`) wraps one Matter compound body with N render sprites, a chunks map, and an adjacency graph. `AsteroidSpawner` emits `CompoundAsteroid` instances. `GameScene` registers asteroids in a list, syncs sprites each frame, applies kinematic fall to the compound body (not per-chunk), and routes weapon collisions via `part.plugin.{asteroid, chunkId}`. Weapons get a unified `ChunkTarget` query surface so laser/missile/blackhole don't care about the underlying storage. The `enforceWeaponBarriers()` per-frame push is deleted; Matter's native solver handles pile pressure on compound bodies.

**Tech Stack:** Phaser 3 + Matter.js, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-16-compound-body-asteroid-design.md`

**Branch:** `feature/compound-asteroids` (already created, spec committed).

---

## File Structure

**New files:**
- `src/game/asteroidGraph.ts` — pure `applyKillAndSplit(adjacency, chunkId)` helper.
- `src/game/asteroidGraph.test.ts` — vitest for the helper.
- `src/game/compoundAsteroid.ts` — new `CompoundAsteroid` class.
- `src/game/chunkTarget.ts` — `ChunkTarget` interface for weapon-facing chunk queries.

**Modified files:**
- `src/game/asteroidSpawner.ts` — emit `CompoundAsteroid`, expose registry.
- `src/scenes/GameScene.ts` — new update loop, new collision routing, chunk query helpers, delete `enforceWeaponBarriers`, simplify `applyKinematicFall`.
- `src/game/weapons/weaponBehavior.ts` — `chunks` param becomes `ChunkTarget[]`; `blocksChunks` + `getBarrierBodies` stay for arena wall compatibility but are no longer read by a barrier-push loop.
- `src/game/weapons/sawBehavior.ts` — collision path uses `part.plugin.{asteroid,chunkId}`.
- `src/game/weapons/laserBehavior.ts` — consumes `ChunkTarget[]`.
- `src/game/weapons/missileBehavior.ts` — consumes `ChunkTarget[]`.
- `src/game/weapons/blackholeBehavior.ts` — iterates asteroids and loose dead chunks separately.

**Deleted files (last task):**
- `src/game/asteroid.ts` — replaced entirely by `compoundAsteroid.ts`.

**Docs touched (last task):**
- `ROADMAP.md`, `CLAUDE.md`, `README.md`.

---

## Conventions

- Commit per task with a terse one-line message (no body, no trailers).
- No force-pushes, no `--no-verify`.
- Run `npm test` after every task that changes TypeScript; must stay green.
- Run `npm run build` before the final merge.
- Chrome verification (via chrome-devtools MCP) is required before the code-review task.

---

### Task 1: Pure graph helper with TDD

**Files:**
- Create: `src/game/asteroidGraph.ts`
- Create: `src/game/asteroidGraph.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/game/asteroidGraph.test.ts
import { describe, expect, it } from 'vitest';
import { applyKillAndSplit } from './asteroidGraph';

function graphOf(edges: Array<[string, string]>): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  const touch = (k: string) => {
    if (!g.has(k)) g.set(k, new Set());
    return g.get(k)!;
  };
  for (const [a, b] of edges) {
    touch(a).add(b);
    touch(b).add(a);
  }
  return g;
}

describe('applyKillAndSplit', () => {
  it('removes a leaf chunk without splitting', () => {
    // A — B — C ; kill C
    const g = graphOf([['A', 'B'], ['B', 'C']]);
    const { prunedAdjacency, components } = applyKillAndSplit(g, 'C');
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['A', 'B']);
    expect(prunedAdjacency.has('C')).toBe(false);
    expect(prunedAdjacency.get('B')?.has('C')).toBe(false);
  });

  it('splits a chain into two components when bridge chunk dies', () => {
    // X — X — X — X — X ; kill the middle
    const g = graphOf([
      ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'],
    ]);
    const { components } = applyKillAndSplit(g, 'c');
    expect(components).toHaveLength(2);
    const sorted = components.map((c) => c.sort()).sort((x, y) => x[0].localeCompare(y[0]));
    expect(sorted[0]).toEqual(['a', 'b']);
    expect(sorted[1]).toEqual(['d', 'e']);
  });

  it('keeps a ring connected when a single node dies', () => {
    // ring of 4: a-b-c-d-a ; kill b
    const g = graphOf([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]);
    const { components } = applyKillAndSplit(g, 'b');
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['a', 'c', 'd']);
  });

  it('returns zero components when the last node dies', () => {
    const g = graphOf([]);
    g.set('only', new Set());
    const { components, prunedAdjacency } = applyKillAndSplit(g, 'only');
    expect(components).toHaveLength(0);
    expect(prunedAdjacency.size).toBe(0);
  });

  it('is non-destructive on the input map', () => {
    const g = graphOf([['a', 'b']]);
    applyKillAndSplit(g, 'a');
    // Original graph must still contain both nodes and the edge.
    expect(g.get('a')?.has('b')).toBe(true);
    expect(g.get('b')?.has('a')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm test -- asteroidGraph`
Expected: FAIL — `applyKillAndSplit` is not exported.

- [ ] **Step 3: Implement the helper**

```typescript
// src/game/asteroidGraph.ts
import { connectedComponents } from './connectedComponents';

export interface KillAndSplitResult {
  readonly prunedAdjacency: Map<string, Set<string>>;
  readonly components: string[][];
}

/**
 * Pure helper: returns a new adjacency map with `killedChunkId` removed
 * (and all edges to it pruned), plus the connected components of the
 * resulting graph. Does NOT mutate the input.
 */
export function applyKillAndSplit(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  killedChunkId: string,
): KillAndSplitResult {
  const pruned = new Map<string, Set<string>>();
  for (const [k, v] of adjacency) {
    if (k === killedChunkId) continue;
    const next = new Set<string>();
    for (const n of v) if (n !== killedChunkId) next.add(n);
    pruned.set(k, next);
  }
  const components = connectedComponents(pruned);
  return { prunedAdjacency: pruned, components };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- asteroidGraph`
Expected: PASS — 5 tests.

- [ ] **Step 5: Run full test suite to make sure nothing else broke**

Run: `npm test`
Expected: PASS — 82 tests (77 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/game/asteroidGraph.ts src/game/asteroidGraph.test.ts
git commit -m "asteroid: pure applyKillAndSplit helper + tests"
```

---

### Task 2: ChunkTarget interface + scene-level registries

This task introduces the weapon-facing abstraction. A `ChunkTarget` represents "something a weapon can damage at (x, y)." Both live compound parts and loose dead confetti chunks satisfy it.

**Files:**
- Create: `src/game/chunkTarget.ts`

- [ ] **Step 1: Define the interface**

```typescript
// src/game/chunkTarget.ts
/**
 * A damageable chunk — either a live part inside a compound asteroid or a
 * loose dead confetti chunk. Weapons consume this interface and don't care
 * about the underlying storage.
 */
export interface ChunkTarget {
  readonly x: number;
  readonly y: number;
  readonly dead: boolean;
  readonly tier: number;
  /** Apply `amount` damage. Returns true if the chunk was killed by this call. */
  damage(amount: number): boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/game/chunkTarget.ts
git commit -m "asteroid: ChunkTarget interface for weapon queries"
```

---

### Task 3: CompoundAsteroid class — construction only

Build the compound body + sprites in the constructor. Damage and splitting come in later tasks.

**Files:**
- Create: `src/game/compoundAsteroid.ts`

- [ ] **Step 1: Implement the class scaffolding**

```typescript
// src/game/compoundAsteroid.ts
import Phaser from 'phaser';
import type { AsteroidShape } from './shape';
import { type Material, textureKeyFor } from './materials';

export const CHUNK_PIXEL_SIZE = 12;

interface ChunkPart {
  readonly chunkId: string;
  readonly material: Material;
  readonly isCore: boolean;
  readonly localOffset: { x: number; y: number };
  readonly bodyPart: MatterJS.BodyType;
  readonly sprite: Phaser.GameObjects.Image;
  hp: number;
  readonly maxHp: number;
}

export interface ChunkPartPlugin {
  readonly kind: 'chunk';
  readonly asteroid: CompoundAsteroid;
  readonly chunkId: string;
}

export class CompoundAsteroid {
  readonly chunks = new Map<string, ChunkPart>();
  readonly adjacency = new Map<string, Set<string>>();
  private compoundBody: MatterJS.BodyType;

  constructor(
    private readonly scene: Phaser.Scene,
    shape: AsteroidShape,
    spawnX: number,
    spawnY: number,
    hpMultiplier: number,
    materialsByChunk: ReadonlyMap<string, Material>,
  ) {
    // Copy adjacency into a mutable map we own.
    for (const [k, v] of shape.adjacency) {
      this.adjacency.set(k, new Set(v));
    }

    // Compute the centroid of the shape so localOffsets are symmetric.
    let sumX = 0;
    let sumY = 0;
    for (const c of shape.cells) {
      sumX += c.x;
      sumY += c.y;
    }
    const avgX = sumX / shape.cells.length;
    const avgY = sumY / shape.cells.length;

    // Build parts. Each part is a raw Matter rectangle body at its world
    // position; Matter.Body.create will re-center offsets onto the compound.
    const matterBodies = this.scene.matter.bodies;
    const parts: MatterJS.BodyType[] = [];
    const partInfos: Array<{
      part: MatterJS.BodyType;
      chunkId: string;
      material: Material;
      isCore: boolean;
      localOffset: { x: number; y: number };
    }> = [];

    for (const [, entries] of shape.chunksByCell) {
      for (const entry of entries) {
        const material = materialsByChunk.get(entry.chunkId);
        if (!material) continue;
        const isCore = entry.chunkId === shape.coreChunkId;
        const localX = (entry.cell.x - avgX) * CHUNK_PIXEL_SIZE;
        const localY = -(entry.cell.y - avgY) * CHUNK_PIXEL_SIZE;
        const worldX = spawnX + localX;
        const worldY = spawnY + localY;

        const part = matterBodies.rectangle(
          worldX, worldY, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE,
          { friction: 0.1, frictionAir: 0.005, restitution: 0, mass: 0.25, slop: 0.005 },
        );
        parts.push(part);
        partInfos.push({
          part, chunkId: entry.chunkId, material, isCore,
          localOffset: { x: localX, y: localY },
        });
      }
    }

    // Create the compound body. When parts.length === 1, Matter treats the
    // single body as non-compound; our wrapper reads from `chunks` for the
    // canonical chunk list so the code path is uniform.
    const body = this.scene.matter.body.create({
      parts,
      position: { x: spawnX, y: spawnY },
      frictionAir: 0.005,
    });
    this.compoundBody = body;

    // Disable gravity for the live asteroid; GameScene drives Y velocity.
    (body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
      x: 0, y: 0,
    };

    this.scene.matter.world.add(body);

    // Attach plugin data for collision routing + build render sprites.
    for (const info of partInfos) {
      const plugin: ChunkPartPlugin = {
        kind: 'chunk',
        asteroid: this,
        chunkId: info.chunkId,
      };
      (info.part as unknown as { plugin: ChunkPartPlugin }).plugin = plugin;

      const sprite = this.scene.add.image(0, 0, textureKeyFor(info.material));
      sprite.setDepth(0);

      const maxHp = info.material.tier * hpMultiplier;
      this.chunks.set(info.chunkId, {
        chunkId: info.chunkId,
        material: info.material,
        isCore: info.isCore,
        localOffset: info.localOffset,
        bodyPart: info.part,
        sprite,
        hp: maxHp,
        maxHp,
      });
    }

    this.syncSprites();
  }

  get body(): MatterJS.BodyType { return this.compoundBody; }

  get isAlive(): boolean { return this.chunks.size > 0; }

  applyKinematicFall(velocityY: number): void {
    this.scene.matter.body.setVelocity(this.compoundBody, {
      x: this.compoundBody.velocity.x, y: velocityY,
    });
  }

  syncSprites(): void {
    const pos = this.compoundBody.position;
    const angle = this.compoundBody.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const chunk of this.chunks.values()) {
      const { x: ox, y: oy } = chunk.localOffset;
      chunk.sprite.x = pos.x + (ox * cos - oy * sin);
      chunk.sprite.y = pos.y + (ox * sin + oy * cos);
      chunk.sprite.rotation = angle;
    }
  }

  isOutOfBounds(maxY: number): boolean {
    return this.compoundBody.position.y > maxY;
  }

  destroy(): void {
    this.scene.matter.world.remove(this.compoundBody);
    for (const chunk of this.chunks.values()) {
      chunk.sprite.destroy();
    }
    this.chunks.clear();
    this.adjacency.clear();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no new type errors in new file.

- [ ] **Step 3: Commit**

```bash
git add src/game/compoundAsteroid.ts
git commit -m "asteroid: CompoundAsteroid class scaffold (construction only)"
```

---

### Task 4: Add `damageChunk` + extract-only path (no split)

**Files:**
- Modify: `src/game/compoundAsteroid.ts`

- [ ] **Step 1: Add damage + extraction methods**

Append to `CompoundAsteroid`:

```typescript
  damageChunk(chunkId: string, amount: number): { killed: boolean; hp: number } {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) return { killed: false, hp: 0 };
    chunk.hp -= amount;
    if (chunk.hp <= 0) return { killed: true, hp: 0 };
    return { killed: false, hp: chunk.hp };
  }

  /**
   * Remove the dead chunk from the compound body and return the state needed
   * to spawn a loose confetti chunk (the caller creates the physics body to
   * avoid cross-cutting concerns). Also prunes the adjacency graph.
   *
   * Caller is responsible for running connected-components on the pruned
   * adjacency and calling `split()` if there are multiple components.
   */
  extractDeadChunk(chunkId: string): {
    worldX: number; worldY: number;
    velocityX: number; velocityY: number;
    material: Material;
    textureKey: string;
    isCore: boolean;
  } | null {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) return null;

    const body = this.compoundBody;
    const angle = body.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ox = chunk.localOffset.x;
    const oy = chunk.localOffset.y;
    const worldX = body.position.x + (ox * cos - oy * sin);
    const worldY = body.position.y + (ox * sin + oy * cos);

    // Tangential velocity contribution from angular velocity (ω × r).
    const w = body.angularVelocity;
    const tvx = -w * (ox * sin + oy * cos);
    const tvy =  w * (ox * cos - oy * sin);
    const velocityX = body.velocity.x + tvx;
    const velocityY = body.velocity.y + tvy;

    // Rebuild the compound without this part.
    const remainingParts: MatterJS.BodyType[] = [];
    for (const c of this.chunks.values()) {
      if (c.chunkId !== chunkId) remainingParts.push(c.bodyPart);
    }
    // Matter.Body.setParts needs at least one part; callers must call split()
    // or destroy() when chunks.size reaches zero.
    if (remainingParts.length > 0) {
      this.scene.matter.body.setParts(this.compoundBody, remainingParts, false);
    }

    // Drop sprite + chunks entry. Adjacency is NOT pruned here — the caller
    // (scene) uses applyKillAndSplit to compute pruned adjacency + components
    // in one pass and then assigns the result back to `this.adjacency`.
    chunk.sprite.destroy();
    this.chunks.delete(chunkId);

    return {
      worldX, worldY, velocityX, velocityY,
      material: chunk.material,
      textureKey: textureKeyFor(chunk.material),
      isCore: chunk.isCore,
    };
  }

  /** Replace the adjacency graph (used after applyKillAndSplit). */
  setAdjacency(adjacency: Map<string, Set<string>>): void {
    this.adjacency.clear();
    for (const [k, v] of adjacency) this.adjacency.set(k, v);
  }
```

Also update the imports at the top of `compoundAsteroid.ts` to include `Material` already exported (already done in Task 3 — confirm). No new imports.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/game/compoundAsteroid.ts
git commit -m "asteroid: damageChunk + extractDeadChunk (no split yet)"
```

---

### Task 5: Implement split-on-disconnect

**Files:**
- Modify: `src/game/compoundAsteroid.ts`

- [ ] **Step 1: Add `split()` method**

Append to `CompoundAsteroid`:

```typescript
  /**
   * Split this asteroid into N new CompoundAsteroids, one per connected
   * component given. All remaining chunks must be assigned to exactly one
   * component (validated with an invariant). After this call, this instance
   * is destroyed; callers must replace the scene-level registration with the
   * returned array.
   */
  split(components: readonly string[][]): CompoundAsteroid[] {
    if (components.length < 2) {
      throw new Error('split() requires at least 2 components');
    }

    const parent = this.compoundBody;
    const px = parent.position.x;
    const py = parent.position.y;
    const pAngle = parent.angle;
    const pVx = parent.velocity.x;
    const pVy = parent.velocity.y;
    const pW = parent.angularVelocity;

    const results: CompoundAsteroid[] = [];

    for (const component of components) {
      // Compute the new compound's centroid in parent-local space (average
      // of its chunks' localOffsets), then translate to world.
      let cox = 0;
      let coy = 0;
      for (const id of component) {
        const chunk = this.chunks.get(id);
        if (!chunk) throw new Error(`split: missing chunk ${id}`);
        cox += chunk.localOffset.x;
        coy += chunk.localOffset.y;
      }
      cox /= component.length;
      coy /= component.length;

      const cos = Math.cos(pAngle);
      const sin = Math.sin(pAngle);
      const newCenterX = px + (cox * cos - coy * sin);
      const newCenterY = py + (cox * sin + coy * cos);

      // Tangential velocity at this new center, relative to parent.
      const tvx = -pW * (cox * sin + coy * cos);
      const tvy =  pW * (cox * cos - coy * sin);
      const newVx = pVx + tvx;
      const newVy = pVy + tvy;

      const child = CompoundAsteroid.fromPartsOfParent({
        scene: this.scene,
        parent: this,
        component,
        newCenter: { x: newCenterX, y: newCenterY },
        parentAngle: pAngle,
        parentCentroidOffset: { x: cox, y: coy },
        velocity: { x: newVx, y: newVy },
        angularVelocity: pW,
      });
      results.push(child);
    }

    // Tear down the parent. Do NOT destroy sprites — they've been moved to
    // the children.
    this.scene.matter.world.remove(this.compoundBody);
    this.chunks.clear();
    this.adjacency.clear();

    return results;
  }

  /**
   * Build a child asteroid by carving a subset of chunks out of the parent.
   * Private helper used by split(); uses a factory pattern because the
   * constructor's public signature takes a shape, not a carved subset.
   */
  private static fromPartsOfParent(args: {
    scene: Phaser.Scene;
    parent: CompoundAsteroid;
    component: readonly string[];
    newCenter: { x: number; y: number };
    parentAngle: number;
    parentCentroidOffset: { x: number; y: number };
    velocity: { x: number; y: number };
    angularVelocity: number;
  }): CompoundAsteroid {
    const child = Object.create(CompoundAsteroid.prototype) as CompoundAsteroid;
    // Private-field init:
    (child as unknown as { scene: Phaser.Scene }).scene = args.scene;
    (child as unknown as { chunks: Map<string, ChunkPart> }).chunks = new Map();
    (child as unknown as { adjacency: Map<string, Set<string>> }).adjacency = new Map();

    // Re-create Matter bodies for each chunk in the component at their new
    // local offsets (parent-local offset minus parent centroid). We can't
    // move parts between Matter compounds, so we create fresh parts.
    const matterBodies = args.scene.matter.bodies;
    const newParts: MatterJS.BodyType[] = [];
    const cos = Math.cos(args.parentAngle);
    const sin = Math.sin(args.parentAngle);

    for (const id of args.component) {
      const parentChunk = args.parent.chunks.get(id);
      if (!parentChunk) throw new Error(`fromPartsOfParent: missing ${id}`);
      const localX = parentChunk.localOffset.x - args.parentCentroidOffset.x;
      const localY = parentChunk.localOffset.y - args.parentCentroidOffset.y;
      const worldX = args.newCenter.x + (localX * cos - localY * sin);
      const worldY = args.newCenter.y + (localX * sin + localY * cos);

      const part = matterBodies.rectangle(
        worldX, worldY, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE,
        { friction: 0.1, frictionAir: 0.005, restitution: 0, mass: 0.25, slop: 0.005 },
      );
      newParts.push(part);

      const plugin: ChunkPartPlugin = { kind: 'chunk', asteroid: child, chunkId: id };
      (part as unknown as { plugin: ChunkPartPlugin }).plugin = plugin;

      // Migrate sprite reference — same Phaser.GameObjects.Image, new owner.
      const sprite = parentChunk.sprite;

      child.chunks.set(id, {
        chunkId: id,
        material: parentChunk.material,
        isCore: parentChunk.isCore,
        localOffset: { x: localX, y: localY },
        bodyPart: part,
        sprite,
        hp: parentChunk.hp,
        maxHp: parentChunk.maxHp,
      });

      // Migrate adjacency for nodes that survive in THIS component.
      const parentNeighbors = args.parent.adjacency.get(id);
      if (parentNeighbors) {
        const componentSet = new Set(args.component);
        const kept = new Set<string>();
        for (const n of parentNeighbors) {
          if (componentSet.has(n)) kept.add(n);
        }
        child.adjacency.set(id, kept);
      }
    }

    const body = args.scene.matter.body.create({
      parts: newParts,
      position: args.newCenter,
      frictionAir: 0.005,
    });
    (body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
      x: 0, y: 0,
    };
    args.scene.matter.body.setAngle(body, args.parentAngle);
    args.scene.matter.body.setVelocity(body, args.velocity);
    args.scene.matter.body.setAngularVelocity(body, args.angularVelocity);
    args.scene.matter.world.add(body);
    (child as unknown as { compoundBody: MatterJS.BodyType }).compoundBody = body;

    child.syncSprites();
    return child;
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/game/compoundAsteroid.ts
git commit -m "asteroid: split-on-disconnect for compound asteroids"
```

---

### Task 6: Spawner + scene registration

Swap `AsteroidSpawner` to emit `CompoundAsteroid` and store them in a scene-level registry. Spawner no longer populates the old `chunkImages` set (that stays for loose dead chunks only).

**Files:**
- Modify: `src/game/asteroidSpawner.ts`
- Modify: `src/scenes/GameScene.ts` (registrations + spawn call only; collision wiring comes in Task 8)

- [ ] **Step 1: Rewrite `AsteroidSpawner` to return `CompoundAsteroid`**

Replace the full contents of `src/game/asteroidSpawner.ts` with:

```typescript
import type Phaser from 'phaser';
import { CompoundAsteroid } from './compoundAsteroid';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { chooseMaterial, type Material } from './materials';
import { SeededRng } from './rng';

export interface AsteroidSpawnParams {
  readonly minChunks: number;
  readonly maxChunks: number;
  readonly hpMultiplier: number;
  readonly qualityLevel: number;
  readonly fallSpeedMultiplier: number;
}

export class AsteroidSpawner {
  constructor(private readonly scene: Phaser.Scene) {}

  spawnOne(worldX: number, worldY: number, params: AsteroidSpawnParams): CompoundAsteroid {
    const seed = (Math.random() * 0xffffffff) >>> 0 || 1;
    const rng = new SeededRng(seed);

    const span = Math.max(0, params.maxChunks - params.minChunks);
    const count = params.minChunks + rng.nextInt(span + 1);

    const generator = new CircularShapeGenerator(rng);
    const shape = generator.generate(count);

    const materialsByChunk = new Map<string, Material>();
    for (const entries of shape.chunksByCell.values()) {
      for (const entry of entries) {
        materialsByChunk.set(entry.chunkId, chooseMaterial(params.qualityLevel, rng));
      }
    }

    return new CompoundAsteroid(
      this.scene, shape, worldX, worldY, params.hpMultiplier, materialsByChunk,
    );
  }
}
```

- [ ] **Step 2: Add asteroid + dead-chunk registries to `GameScene`**

In `src/scenes/GameScene.ts`, replace the `chunkImages` field and `spawner` construction with:

```typescript
  private liveAsteroids: CompoundAsteroid[] = [];
  private deadChunks = new Set<Phaser.Physics.Matter.Image>();
```

(delete the line `private chunkImages = new Set<Phaser.Physics.Matter.Image>();`)

In `create()`:
```typescript
    this.spawner = new AsteroidSpawner(this);
```
(change from `new AsteroidSpawner(this, this.chunkImages)`)

In `spawnAsteroid()` replace body with:
```typescript
  private spawnAsteroid(): void {
    const halfW = this.scale.width / 2;
    const jitter = (Math.random() - 0.5) * (this.effectiveParams.channelHalfWidth * 0.6);
    const asteroid = this.spawner.spawnOne(halfW + jitter, SPAWN_Y, {
      minChunks: this.effectiveParams.minChunks,
      maxChunks: this.effectiveParams.maxChunks,
      hpMultiplier: this.effectiveParams.maxHpPerChunk,
      qualityLevel: this.effectiveParams.qualityLevel,
      fallSpeedMultiplier: this.effectiveParams.fallSpeedMultiplier,
    });
    this.liveAsteroids.push(asteroid);
    this.spawnedCount++;
    this.spawnedChunks += asteroid.chunks.size;
  }
```

At top of file, update imports:
```typescript
import { CompoundAsteroid } from '../game/compoundAsteroid';
import { CHUNK_PIXEL_SIZE } from '../game/compoundAsteroid';
// Remove: import type { Asteroid } from '../game/asteroid';
// Remove: import { CHUNK_PIXEL_SIZE } from '../game/asteroid';
```

- [ ] **Step 3: Comment out broken call sites temporarily**

The file will have compile errors at `enforceWeaponBarriers`, `applyKinematicFall`, `collectAtDeathLine`, `update()` loop, and the collision handler (`handleContact`). Tasks 7, 8, 9 fix each. For now wrap offending bodies in `if (false) { ... }` or comment them out so this task commits cleanly:

- In `update()`: comment out the `applyKinematicFall()`, `enforceWeaponBarriers()`, the `for (const chunk of this.chunkImages)` loop, and the `debugText` line that references `this.chunkImages.size`. Add a `// TODO task 7: new update loop` marker.
- Comment out the bodies of `applyKinematicFall()`, `enforceWeaponBarriers()`, `handleContact()`, `collectAtDeathLine()`, and the `pushOutOfCircle` helper.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Full test suite still green: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/game/asteroidSpawner.ts src/scenes/GameScene.ts
git commit -m "asteroid: spawner emits CompoundAsteroid; scene registries"
```

---

### Task 7: New `update()` loop + out-of-bounds cleanup

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Replace `update()` body**

```typescript
  update(_time: number, delta: number): void {
    // Weapons run first (existing API).
    for (const inst of this.weaponInstances) {
      inst.behavior.update(this, inst.sprite, delta, this.buildChunkTargets(), this.effectiveParams);
    }

    const maxY = this.scale.height + 120;
    const fall = this.effectiveParams.fallSpeedMultiplier;

    // Live asteroids: kinematic fall, sprite sync, out-of-bounds cleanup.
    for (let i = this.liveAsteroids.length - 1; i >= 0; i--) {
      const ast = this.liveAsteroids[i];
      if (!ast.isAlive) {
        ast.destroy();
        this.liveAsteroids.splice(i, 1);
        continue;
      }
      ast.applyKinematicFall(fall);
      ast.syncSprites();
      if (ast.isOutOfBounds(maxY)) {
        ast.destroy();
        this.liveAsteroids.splice(i, 1);
      }
    }

    // Dead confetti chunks: let Matter handle gravity; only OOB + death-line.
    for (const chunk of this.deadChunks) {
      if (!chunk.active) {
        this.deadChunks.delete(chunk);
        continue;
      }
      if (chunk.y > DEATH_LINE_Y) {
        this.collectDeadAtDeathLine(chunk);
      } else if (chunk.y > maxY) {
        this.deadChunks.delete(chunk);
        chunk.destroy();
      }
    }

    if (this.debugMode && this.debugText) {
      const fps = Math.round(this.game.loop.actualFps);
      const world = this.matter.world.localWorld as unknown as { bodies: unknown[] };
      const bodies = world.bodies.length;
      let liveChunkCount = 0;
      for (const ast of this.liveAsteroids) liveChunkCount += ast.chunks.size;
      this.debugText.setText(
        `FPS ${fps}  ·  bodies ${bodies}  ·  asteroids ${this.liveAsteroids.length}  ·  live ${liveChunkCount}  ·  dead ${this.deadChunks.size}`,
      );
    }
  }

  private buildChunkTargets(): ChunkTarget[] {
    const targets: ChunkTarget[] = [];
    for (const ast of this.liveAsteroids) {
      for (const chunk of ast.chunks.values()) {
        const pos = chunk.bodyPart.position;
        targets.push({
          x: pos.x, y: pos.y, dead: false, tier: chunk.material.tier,
          damage: (amount) => this.damageLiveChunk(ast, chunk.chunkId, amount),
        });
      }
    }
    for (const dead of this.deadChunks) {
      if (!dead.active) continue;
      const tier = (dead.getData('tier') as number | undefined) ?? 1;
      targets.push({
        x: dead.x, y: dead.y, dead: true, tier,
        damage: () => false,  // already dead; no further damage effect
      });
    }
    return targets;
  }

  /**
   * Damage a live chunk. If it dies, extract to a loose dead chunk, run BFS
   * on the pruned adjacency, and split the asteroid if disconnected.
   * Returns true if the chunk died on this call.
   */
  damageLiveChunk(ast: CompoundAsteroid, chunkId: string, amount: number): boolean {
    const result = ast.damageChunk(chunkId, amount);
    if (!result.killed) return false;

    // Compute pruned adjacency + components BEFORE extracting, while
    // the old graph is still intact.
    const { prunedAdjacency, components } = applyKillAndSplit(ast.adjacency, chunkId);

    const extracted = ast.extractDeadChunk(chunkId);
    if (extracted) this.spawnDeadConfettiChunk(extracted);

    if (components.length >= 2) {
      const idx = this.liveAsteroids.indexOf(ast);
      if (idx >= 0) this.liveAsteroids.splice(idx, 1);
      const children = ast.split(components);
      this.liveAsteroids.push(...children);
    } else if (components.length === 1) {
      ast.setAdjacency(prunedAdjacency);
    }
    // components.length === 0: asteroid is empty; update() removes it
    // on the next tick via isAlive === false.

    return true;
  }

  private spawnDeadConfettiChunk(info: {
    worldX: number; worldY: number;
    velocityX: number; velocityY: number;
    material: Material; textureKey: string;
    isCore: boolean;
  }): void {
    const chunk = this.matter.add.image(info.worldX, info.worldY, info.textureKey);
    chunk.setRectangle(CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
    chunk.setMass(0.25);
    chunk.setFriction(0.1);
    chunk.setFrictionAir(0.005);
    chunk.setBounce(0);
    chunk.setVelocity(info.velocityX, info.velocityY);
    chunk.setAlpha(0.55);
    chunk.setScale(0.8);
    chunk.setData('kind', 'chunk');
    chunk.setData('dead', true);
    chunk.setData('tier', info.material.tier);
    chunk.setData('material', info.material);
    chunk.setData('isCore', info.isCore);
    this.deadChunks.add(chunk);
  }

  private collectDeadAtDeathLine(chunk: Phaser.Physics.Matter.Image): void {
    const tier = (chunk.getData('tier') as number | undefined) ?? 1;
    gameplayState.addCash(tier);
    this.cashFromSaw += tier;
    this.collectedDead++;
    this.spawnConfetti(chunk.x, chunk.y);
    this.deadChunks.delete(chunk);
    chunk.destroy();
  }
```

Add imports at the top of `src/scenes/GameScene.ts`:
```typescript
import type { ChunkTarget } from '../game/chunkTarget';
import { applyKillAndSplit } from '../game/asteroidGraph';
```

Delete `applyKinematicFall`, `enforceWeaponBarriers`, `pushOutOfCircle`, and `collectAtDeathLine` method bodies (they are replaced). The grinder collision path (live chunk catches the line for $1) now lives inside the compound-body collision handler — see Task 8.

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "scene: new update loop using asteroid list + dead-chunk set"
```

---

### Task 8: Collision routing via `part.plugin` + grinder-line on live compounds

**Files:**
- Modify: `src/scenes/GameScene.ts` (collision handler only)
- Modify: `src/game/weapons/sawBehavior.ts`

- [ ] **Step 1: Rewrite `handleContact` to use plugin-based routing**

Replace `handleContact` in `GameScene.ts`:

```typescript
  private handleContact(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const partA = bodyA;
    const partB = bodyB;

    const chunkPart =
      this.isChunkPart(partA) ? partA :
      this.isChunkPart(partB) ? partB : null;
    if (!chunkPart) return;
    const otherPart = chunkPart === partA ? partB : partA;

    const plugin = (chunkPart as unknown as { plugin?: ChunkPartPlugin }).plugin;
    if (!plugin || plugin.kind !== 'chunk') return;

    // Saw blade collision
    const goOther = (otherPart as { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    if (goOther && goOther.getData?.('kind') === 'saw') {
      for (const inst of this.weaponInstances) {
        if (inst.behavior.handleCompoundHit) {
          const handled = inst.behavior.handleCompoundHit(plugin.asteroid, plugin.chunkId, otherPart as MatterJS.BodyType, this.effectiveParams, this);
          if (handled?.hit) {
            this.weaponHits++;
            if (handled.killed) this.killedBySaw++;
            return;
          }
        }
      }
    }
    // Grinder (death line) — in the new world, the death-line check is
    // still a y > DEATH_LINE_Y poll on the body position, handled below,
    // not via collision events.
  }

  private isChunkPart(body: MatterJS.BodyType): boolean {
    const plugin = (body as unknown as { plugin?: { kind?: string } }).plugin;
    return plugin?.kind === 'chunk';
  }
```

Add a death-line-for-live-compound check. Modify the live-asteroid loop in `update()` (from Task 7) so that after `syncSprites()` it also grinds any parts below the death line. Replace that loop body with:

```typescript
    for (let i = this.liveAsteroids.length - 1; i >= 0; i--) {
      const ast = this.liveAsteroids[i];
      if (!ast.isAlive) {
        ast.destroy();
        this.liveAsteroids.splice(i, 1);
        continue;
      }
      ast.applyKinematicFall(fall);
      ast.syncSprites();

      // Grinder line: any chunk whose part is below DEATH_LINE_Y gets
      // chewed. $1 payout each. Snapshot IDs first because damageLiveChunk
      // may split the asteroid mid-iteration.
      const toGrind: string[] = [];
      for (const chunk of ast.chunks.values()) {
        if (chunk.bodyPart.position.y > DEATH_LINE_Y) toGrind.push(chunk.chunkId);
      }
      for (const id of toGrind) {
        // Note: `ast` may have been removed from liveAsteroids by a prior
        // split on an earlier id. damageLiveChunk no-ops if chunkId is gone.
        const killed = this.damageLiveChunk(ast, id, Number.POSITIVE_INFINITY);
        if (killed) {
          gameplayState.addCash(1);
          this.cashFromLine += 1;
          this.collectedAlive++;
        }
      }

      if (ast.isOutOfBounds(maxY)) {
        ast.destroy();
        const idx = this.liveAsteroids.indexOf(ast);
        if (idx >= 0) this.liveAsteroids.splice(idx, 1);
      }
    }
```

(Delete the original simpler loop body from Task 7 — this is its final form.)

- [ ] **Step 2: Add `handleCompoundHit` to `WeaponBehavior` + saw**

In `src/game/weapons/weaponBehavior.ts` add to the interface:

```typescript
  /** Called when a weapon body collides with a live compound chunk part. */
  handleCompoundHit?(
    asteroid: { chunks: Map<string, unknown> },
    chunkId: string,
    weaponPart: MatterJS.BodyType,
    params: EffectiveGameplayParams,
    scene: Phaser.Scene,
  ): { hit: boolean; killed: boolean } | null;
```

(Type the asteroid argument loosely — `WeaponBehavior` lives under `game/weapons/` and importing `CompoundAsteroid` from a sibling is fine; use `CompoundAsteroid` directly if preferred.)

In `src/game/weapons/sawBehavior.ts`, add a `handleCompoundHit` method that calls `GameScene.damageLiveChunk(asteroid, chunkId, sawDamage)` via a callback passed through scene. Simpler: expose `damageLiveChunk` from scene (already private — make it package-visible via a typed helper on scene), and have saw call it.

The cleanest pattern:

```typescript
// In sawBehavior.ts
handleCompoundHit(
  asteroid: CompoundAsteroid,
  chunkId: string,
  _weaponPart: MatterJS.BodyType,
  params: EffectiveGameplayParams,
  scene: Phaser.Scene,
): { hit: boolean; killed: boolean } {
  const sceneTyped = scene as GameScene;
  const killed = sceneTyped.damageLiveChunk(asteroid, chunkId, params.sawDamage);
  this.hitCount++;
  if (killed) this.killCount++;
  return { hit: true, killed };
}
```

And make `damageLiveChunk` on `GameScene` public (drop the `private` keyword), keeping the JSDoc.

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.ts src/game/weapons/weaponBehavior.ts src/game/weapons/sawBehavior.ts
git commit -m "weapons: compound-aware collision routing; saw + grinder live"
```

---

### Task 9: Update laser, missile, blackhole for `ChunkTarget[]`

**Files:**
- Modify: `src/game/weapons/laserBehavior.ts`
- Modify: `src/game/weapons/missileBehavior.ts`
- Modify: `src/game/weapons/blackholeBehavior.ts`
- Modify: `src/game/weapons/weaponBehavior.ts` (signature update)

- [ ] **Step 1: Update `WeaponBehavior.update` signature**

In `src/game/weapons/weaponBehavior.ts`, change:
```typescript
  chunks: Set<Phaser.Physics.Matter.Image>,
```
to
```typescript
  chunks: ChunkTarget[],
```

Import `ChunkTarget` from `'../chunkTarget'`.

- [ ] **Step 2: Update each behavior to consume `ChunkTarget[]`**

**Laser** (`laserBehavior.ts`): the inner `this.laser.update(...)` call currently iterates the set for ray-hit testing. Update that code path to iterate `chunks: ChunkTarget[]` by `x`, `y`, and call `target.damage(damage)` instead of `asteroid.damageChunkByImage(chunk, damage)`. Return value should reflect damage-dealt same as today.

Keep behavior logic identical — only the iteration source + the damage method change. Read `src/game/weapons/laser.ts` to locate the actual targeting routine; it iterates chunks with arithmetic like `for (const chunk of chunks) { const dx = chunk.x - ...`. Replace `chunk.x` / `chunk.y` with target accessors (already x/y on `ChunkTarget`) and replace the damage call.

**Missile** (`missileBehavior.ts`): same pattern — iterate `ChunkTarget[]` instead of the set. For splash damage in the detonation branch, iterate targets in range and call `target.damage(splashAmount)`.

**Blackhole** (`blackholeBehavior.ts`): this weapon applies FORCE to bodies, not damage. Because live chunks are now compound parts (one body per asteroid), the semantics change: the black hole pulls the whole compound body toward it, not individual chunks. Refactor: instead of `chunks: ChunkTarget[]`, blackhole needs direct access to `liveAsteroids` + `deadChunks`. Add a second optional param `raw?: { asteroids: CompoundAsteroid[]; deadChunks: Iterable<Phaser.Physics.Matter.Image> }` to the weapon update signature, passed through from `GameScene.update()`. Blackhole reads `raw` and iterates asteroids (applying force to `asteroid.body`) and dead chunks (applying force to each body). Other weapons ignore `raw`.

```typescript
// blackholeBehavior.ts — update(...)
const extra = /* pulled from 2nd param */;
if (extra) {
  for (const ast of extra.asteroids) {
    this.bh.pullBody(ast.body, sprite.x, sprite.y, strength);
  }
  for (const dc of extra.deadChunks) {
    this.bh.pullBody(dc.body as MatterJS.BodyType, sprite.x, sprite.y, strength);
  }
}
```

Add a new method `pullBody(body, cx, cy, strength)` on the underlying `BlackHole` class (in `src/game/weapons/blackhole.ts`, replacing the existing force-on-chunk-image loop).

- [ ] **Step 3: Update `GameScene.update()` to pass raw access to weapons**

In `GameScene.update()`, change the weapon update call:
```typescript
    const chunkTargets = this.buildChunkTargets();
    const raw = { asteroids: this.liveAsteroids, deadChunks: this.deadChunks };
    for (const inst of this.weaponInstances) {
      inst.behavior.update(this, inst.sprite, delta, chunkTargets, this.effectiveParams, raw);
    }
```

Add the new optional parameter `raw?` to the `WeaponBehavior.update` signature with appropriate types.

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/weapons src/scenes/GameScene.ts
git commit -m "weapons: laser/missile/blackhole consume ChunkTarget + raw"
```

---

### Task 10: Chrome smoke verification

This is a manual verification task using the Chrome DevTools MCP. Do NOT skip.

- [ ] **Step 1: Start the dev server**

Run in a background terminal: `npm run dev` (Vite serves at http://127.0.0.1:5173).

- [ ] **Step 2: Open in Chrome via MCP**

Use `chrome-devtools-mcp.navigate_page` to open `http://127.0.0.1:5173/?debug=1`.

- [ ] **Step 3: Visual checklist**

Capture `take_screenshot` after each check. Paste the screenshot into the session.

1. ✅ First asteroid drops as a rigid compound — no internal wiggling, no chunk-twitching against walls. (Watch for ~5 seconds.)
2. ✅ Hit the initial asteroid with a saw — chunks that die (one at a time) shrink + fade into confetti and fall independently. Compound continues as a smaller rigid body.
3. ✅ Purchase a laser via UI, target the interior of a wide asteroid. Confirm split: two live compounds separating visibly + one dead chunk drifting away.
4. ✅ Let a full asteroid drift into the grinder (channel floor). Confirm per-part chew-from-bottom, payout accumulates at $1/chunk in the HUD, visible bottom-up erosion.
5. ✅ Purchase a black hole. Confirm it pulls whole asteroids toward it (not individual chunks shearing off).
6. ✅ Under six saw blades at max density, drop a large asteroid — confirm no squish, no inter-chunk jitter, no pile-pressure chaos.
7. ✅ `window.__GAME__.scene.liveAsteroids.length` and `window.__GAME__.scene.deadChunks.size` report sensibly via `evaluate_script`.

- [ ] **Step 4: Read console logs**

Run `chrome-devtools-mcp.list_console_messages`. Expected: zero errors, zero warnings that weren't there before the refactor.

- [ ] **Step 5: Commit any verification notes**

If no code changes — no commit. If small fixes discovered (typos, forgotten branches) — commit each with terse messages.

---

### Task 11: Delete old `asteroid.ts`

**Files:**
- Delete: `src/game/asteroid.ts`

- [ ] **Step 1: Confirm no imports remain**

Run: `grep -rn "from '.*game/asteroid'" src/ | grep -v compoundAsteroid | grep -v asteroidGraph | grep -v asteroidSpawner`
Expected: empty output.

- [ ] **Step 2: Delete the file**

```bash
git rm src/game/asteroid.ts
```

- [ ] **Step 3: Remove any stale barrier-body accessors**

In `src/game/weapons/weaponBehavior.ts`, delete the `blocksChunks` and `getBarrierBodies?` members if they are no longer referenced by anything. Run:
```bash
grep -rn "blocksChunks\|getBarrierBodies" src/
```
If any weapon still implements these, delete those members from the implementations too. (They existed only to feed `enforceWeaponBarriers`, which is gone.)

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "asteroid: delete welded-constraint Asteroid class"
```

---

### Task 12: Code review pass (required)

Dispatch a fresh reviewer agent with no implementation bias. This is a required phase per global conventions.

- [ ] **Step 1: Run the full test suite and build**

```bash
npm test
npm run build
```
Both must pass before review.

- [ ] **Step 2: Dispatch reviewer**

Use the `Agent` tool with `subagent_type: "feature-dev:code-reviewer"`. Prompt:

> Review the compound-body asteroid refactor on branch `feature/compound-asteroids`. Spec at `docs/superpowers/specs/2026-04-16-compound-body-asteroid-design.md`; plan at `docs/superpowers/plans/2026-04-16-compound-body-asteroid.md`. Focus areas: (1) Does `CompoundAsteroid.extractDeadChunk` correctly compute world velocity for spinning parents via `body.velocity + ω × r`? (2) Does `split()` preserve per-chunk HP / material / isCore? (3) Does the new `damageLiveChunk` correctly distinguish `components.length === 0` / `1` / `≥2`? (4) Is there any lingering use of the old `chunkImages` set? (5) Did removing `enforceWeaponBarriers` reintroduce any corner the Matter solver doesn't handle (e.g., a chunk wedged between a saw and a wall)? Report high-priority issues only.

- [ ] **Step 3: Address findings**

Create one commit per fix with a terse message. Re-run `npm test && npm run build` after each.

---

### Task 13: Docs + FF-merge

**Files:**
- Modify: `ROADMAP.md`
- Modify: `CLAUDE.md`
- Modify: `README.md` (only if feature-set language changes — likely no touch)

- [ ] **Step 1: Update `ROADMAP.md`**

- Under "Current todos (post-Phase 6)", remove or mark `[x]` the "Compound-body asteroid refactor" line.
- Under "Backlog (future work)", remove the "Compound-body asteroid refactor" bullet entirely (it's shipped).
- Optionally add a new phase entry (e.g. "6.5. **Compound-body rewrite** — done (2026-04-XX)") for history.

- [ ] **Step 2: Update `CLAUDE.md` → "Phaser + Matter gotchas"**

- Delete the "Pile pressure defeats the Matter solver" bullet (no longer true — compound bodies handle it natively).
- Delete the "Weld `damping` goes in the `options` bag..." bullet (welds are gone).
- Add a new bullet: "**Asteroids are Matter compound bodies.** One `Matter.Body.create({ parts })` per connected component of live chunks. Killing a chunk → `Matter.Body.setParts(compound, remaining, false)` + spawn a loose dead chunk. Disconnect detection via `connectedComponents` on the live adjacency; disconnect → tear down parent and build new compounds, inheriting pose + linear + angular velocity. Per-part collision routing via `part.plugin.{ kind, asteroid, chunkId }`."

- [ ] **Step 3: Commit docs**

```bash
git add ROADMAP.md CLAUDE.md
git commit -m "docs: roadmap + CLAUDE.md for compound-body refactor"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/compound-asteroids
```

- [ ] **Step 5: Wait for user verification**

Prompt the user to do their own live-browser verification per the global `After deploy, validate live` convention. Do not FF-merge until the user explicitly confirms.

- [ ] **Step 6: FF-merge**

On explicit user approval only:
```bash
git checkout main
git merge --ff-only feature/compound-asteroids
git push origin main
```

- [ ] **Step 7: Update handoff note**

Overwrite `.remember/remember.md` with a fresh handoff summarizing what shipped and what's next (Phase 7 — Save & offline).

---

## Self-review notes

Checked the plan against the spec sections:

- **§1 Data model** → covered by Tasks 2, 3. `ChunkPart` has chunkId/material/maxHp/hp/isCore/localOffset/bodyPart/sprite. Invariants enforced by the wrapper.
- **§2 Kill flow & split logic** → Tasks 4, 5, 7, 8. Surgical `setParts` fast-path in `extractDeadChunk`; `split()` only when components.length ≥ 2.
- **§3 Per-frame update loop** → Task 7. Sprite sync, kinematic fall, out-of-bounds, death-line-for-compounds all present.
- **§4 Testing strategy** → Task 1 covers pure-logic tests. Task 10 covers Chrome smoke.
- **Rollout plan** → Tasks 1–13 match the 7-step rollout in the spec (plus review + docs).

Ambiguity flagged: `CompoundAsteroid.fromPartsOfParent` uses `Object.create(CompoundAsteroid.prototype)` to bypass the public constructor — this is intentional because the constructor takes a `shape`, not a pre-existing partition. Engineers may prefer to refactor into a protected/second constructor; either is fine so long as the invariants hold.

Fixes applied during self-review:
- `applyKillAndSplit` (Task 1) is now actually used in `damageLiveChunk` (Task 7). Adjacency pruning moved out of `extractDeadChunk` into the scene, so the pure helper is the canonical path for kill + connectivity.
- Added `CompoundAsteroid.setAdjacency()` helper (Task 4) so the scene assigns the pruned adjacency back onto the asteroid when no split occurs.
- `fromPartsOfParent` (Task 5) uses a `Set` for the component-membership check, dropping O(N²) behavior on large asteroids.
- Grinder-line integration (Task 8) now shows the complete final form of the live-asteroid update loop, with an explicit note that snapshot-the-IDs is required because splits mid-iteration can relocate the asteroid in the registry.
