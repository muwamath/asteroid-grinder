# Phase 6 — Asteroid Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat pastel asteroids with a 9-tier material ladder (Dirt → Diamond) where per-chunk material drives HP + reward. Add `Asteroid Quality` and `Fall Speed` upgrades. Remove triangles. Stiffen welds. Reserve centroid for future core mechanic.

**Architecture:** A new pure module `src/game/materials.ts` owns the material ladder, the weighted distribution picker, and per-material texture generation. `Asteroid` and `AsteroidSpawner` become material-aware. `GameScene` creates the 9 material textures at boot, applies per-chunk `gravityScale`, and bumps Matter `constraintIterations` + weld `damping`. The reward-on-death formula in `GameScene.collectAtDeathLine` switches from `maxHp * 2` to `material.tier`. Triangles delete from `shape.ts`; `CircularShapeGenerator` simplifies to square-only.

**Tech Stack:** Phaser 3 + Matter.js, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-16-asteroid-overhaul-design.md`

---

### Task 1: Create `materials.ts` module with tier ladder

**Files:**
- Create: `src/game/materials.ts`
- Create: `src/game/materials.test.ts`

- [ ] **Step 1: Write failing tests for ladder constants**

```typescript
// src/game/materials.test.ts
import { describe, expect, it } from 'vitest';
import { MATERIALS, materialByTier, materialByName } from './materials';

describe('MATERIALS ladder', () => {
  it('has 9 tiers in ascending order 1..9', () => {
    expect(MATERIALS).toHaveLength(9);
    MATERIALS.forEach((m, i) => expect(m.tier).toBe(i + 1));
  });

  it('has the expected names in order', () => {
    expect(MATERIALS.map((m) => m.name)).toEqual([
      'dirt', 'stone', 'copper', 'silver', 'gold',
      'ruby', 'emerald', 'sapphire', 'diamond',
    ]);
  });

  it('bands correctly group Earth / Metal / Gem', () => {
    const bands = MATERIALS.map((m) => m.band);
    expect(bands.slice(0, 2)).toEqual(['earth', 'earth']);
    expect(bands.slice(2, 5)).toEqual(['metal', 'metal', 'metal']);
    expect(bands.slice(5, 9)).toEqual(['gem', 'gem', 'gem', 'gem']);
  });

  it('only gems have hasGlow=true', () => {
    for (const m of MATERIALS) {
      expect(m.hasGlow).toBe(m.band === 'gem');
    }
  });

  it('materialByTier looks up by tier number', () => {
    expect(materialByTier(1)?.name).toBe('dirt');
    expect(materialByTier(9)?.name).toBe('diamond');
    expect(materialByTier(0)).toBeUndefined();
    expect(materialByTier(10)).toBeUndefined();
  });

  it('materialByName looks up by name', () => {
    expect(materialByName('copper')?.tier).toBe(3);
    expect(materialByName('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/materials.test.ts`
Expected: FAIL with module not found errors.

- [ ] **Step 3: Create `materials.ts` with ladder data**

```typescript
// src/game/materials.ts
import type { SeededRng } from './rng';

export type MaterialBand = 'earth' | 'metal' | 'gem';

export interface Material {
  readonly tier: number;        // 1..9
  readonly name: string;        // 'dirt', 'stone', ... 'diamond'
  readonly band: MaterialBand;
  readonly fillColors: readonly [string, string, string]; // gradient stops, 135deg
  readonly borderColor: string;
  readonly hasGlow: boolean;
  readonly glowColor: string;
}

export const MATERIALS: readonly Material[] = [
  {
    tier: 1, name: 'dirt', band: 'earth',
    fillColors: ['#6b4a2f', '#5a3d27', '#4a3320'],
    borderColor: '#2a1a0d',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 2, name: 'stone', band: 'earth',
    fillColors: ['#9a9a9a', '#808080', '#6a6a6a'],
    borderColor: '#2a2a2a',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 3, name: 'copper', band: 'metal',
    fillColors: ['#ffb88a', '#c86a38', '#8a3a18'],
    borderColor: '#4a2010',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 4, name: 'silver', band: 'metal',
    fillColors: ['#ffffff', '#b8b8c0', '#6a6a78'],
    borderColor: '#3a3a46',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 5, name: 'gold', band: 'metal',
    fillColors: ['#fff4a0', '#ffc53a', '#a8781a'],
    borderColor: '#5a3a0a',
    hasGlow: false, glowColor: '#000000',
  },
  {
    tier: 6, name: 'ruby', band: 'gem',
    fillColors: ['#ffaab8', '#ff2a4a', '#7a0010'],
    borderColor: '#4a0010',
    hasGlow: true, glowColor: 'rgba(255, 80, 100, 0.7)',
  },
  {
    tier: 7, name: 'emerald', band: 'gem',
    fillColors: ['#a8ffc8', '#18c86a', '#064a1a'],
    borderColor: '#004020',
    hasGlow: true, glowColor: 'rgba(60, 220, 130, 0.7)',
  },
  {
    tier: 8, name: 'sapphire', band: 'gem',
    fillColors: ['#a8c8ff', '#2a5aff', '#061a6a'],
    borderColor: '#00104a',
    hasGlow: true, glowColor: 'rgba(80, 140, 255, 0.7)',
  },
  {
    tier: 9, name: 'diamond', band: 'gem',
    fillColors: ['#ffffff', '#d0e8ff', '#7aa8d0'],
    borderColor: '#4a7090',
    hasGlow: true, glowColor: 'rgba(220, 240, 255, 0.9)',
  },
] as const;

export function materialByTier(tier: number): Material | undefined {
  return MATERIALS.find((m) => m.tier === tier);
}

export function materialByName(name: string): Material | undefined {
  return MATERIALS.find((m) => m.name === name);
}

export function textureKeyFor(material: Material): string {
  return `chunk-${material.name}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/materials.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/materials.ts src/game/materials.test.ts
git commit -m "materials: add 9-tier ladder (Dirt→Diamond) with bands"
```

---

### Task 2: Add `chooseMaterial` weighted distribution

**Files:**
- Modify: `src/game/materials.ts`
- Modify: `src/game/materials.test.ts`

- [ ] **Step 1: Write failing tests for distribution logic**

Add to `materials.test.ts`:

```typescript
import { SeededRng } from './rng';
import { chooseMaterial, materialDistribution } from './materials';

describe('materialDistribution', () => {
  it('at quality 0, only Dirt (tier 1) has nonzero probability', () => {
    const d = materialDistribution(0);
    expect(d[0]).toBeCloseTo(1.0, 6);
    for (let i = 1; i < 9; i++) expect(d[i]).toBe(0);
  });

  it('at quality 1, Dirt ~59% / Stone ~41%', () => {
    const d = materialDistribution(1);
    expect(d[0]).toBeCloseTo(1 / 1.7, 3);
    expect(d[1]).toBeCloseTo(0.7 / 1.7, 3);
    for (let i = 2; i < 9; i++) expect(d[i]).toBe(0);
  });

  it('at quality 8, all 9 tiers appear and diamond is smallest', () => {
    const d = materialDistribution(8);
    d.forEach((p) => expect(p).toBeGreaterThan(0));
    expect(d[8]).toBeLessThan(d[0]); // diamond < dirt
    expect(d[8]).toBeCloseTo(Math.pow(0.7, 8) / ((1 - Math.pow(0.7, 9)) / (1 - 0.7)), 3);
  });

  it('clamps quality above 8 to the same max distribution', () => {
    const d8 = materialDistribution(8);
    const d99 = materialDistribution(99);
    expect(d99).toEqual(d8);
  });

  it('all distributions sum to ~1', () => {
    for (let q = 0; q <= 8; q++) {
      const sum = materialDistribution(q).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    }
  });
});

describe('chooseMaterial', () => {
  it('at quality 0 always returns dirt', () => {
    const rng = new SeededRng(1);
    for (let i = 0; i < 20; i++) {
      expect(chooseMaterial(0, rng).name).toBe('dirt');
    }
  });

  it('at quality 8 produces all 9 materials over many rolls', () => {
    const rng = new SeededRng(42);
    const counts = new Map<string, number>();
    for (let i = 0; i < 5000; i++) {
      const m = chooseMaterial(8, rng);
      counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    expect((counts.get('diamond') ?? 0)).toBeGreaterThan(50); // ~2% of 5000
  });

  it('is deterministic for the same seed', () => {
    const a = new SeededRng(7);
    const b = new SeededRng(7);
    for (let i = 0; i < 50; i++) {
      expect(chooseMaterial(5, a).name).toBe(chooseMaterial(5, b).name);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/materials.test.ts`
Expected: FAIL — `chooseMaterial` / `materialDistribution` are undefined.

- [ ] **Step 3: Implement the distribution**

Add to `materials.ts` below `textureKeyFor`:

```typescript
const DECAY = 0.7;
const MAX_QUALITY = 8;

/** Returns a probability vector of length 9 (one entry per tier). */
export function materialDistribution(qualityLevel: number): number[] {
  const q = Math.max(0, Math.min(MAX_QUALITY, Math.floor(qualityLevel)));
  const maxTier = 1 + q; // tier unlocked at this quality
  const weights: number[] = [];
  let sum = 0;
  for (let t = 1; t <= 9; t++) {
    const w = t <= maxTier ? Math.pow(DECAY, t - 1) : 0;
    weights.push(w);
    sum += w;
  }
  return weights.map((w) => w / sum);
}

export function chooseMaterial(qualityLevel: number, rng: SeededRng): Material {
  const dist = materialDistribution(qualityLevel);
  let roll = rng.next();
  for (let i = 0; i < dist.length; i++) {
    roll -= dist[i];
    if (roll <= 0) return MATERIALS[i];
  }
  return MATERIALS[MATERIALS.length - 1];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/materials.test.ts`
Expected: PASS (all tests, including the 5000-roll sampler).

- [ ] **Step 5: Commit**

```bash
git add src/game/materials.ts src/game/materials.test.ts
git commit -m "materials: add quality-based weighted distribution + picker"
```

---

### Task 3: Add `fallSpeedMultiplier` helper

**Files:**
- Modify: `src/game/materials.ts`
- Modify: `src/game/materials.test.ts`

Rationale: `fallSpeedMultiplier` is a pure formula with no Matter dependency, so it lives beside the materials module rather than polluting `asteroid.ts`. The `upgradeApplier` imports it in Task 5.

- [ ] **Step 1: Write failing tests**

Add to `materials.test.ts`:

```typescript
import { fallSpeedMultiplier } from './materials';

describe('fallSpeedMultiplier', () => {
  it('L0 = 0.15×', () => {
    expect(fallSpeedMultiplier(0)).toBeCloseTo(0.15, 6);
  });
  it('L9 = 1.05×', () => {
    expect(fallSpeedMultiplier(9)).toBeCloseTo(1.05, 6);
  });
  it('linear +0.10 per level', () => {
    expect(fallSpeedMultiplier(3)).toBeCloseTo(0.45, 6);
    expect(fallSpeedMultiplier(5)).toBeCloseTo(0.65, 6);
  });
  it('clamps to level 0 minimum', () => {
    expect(fallSpeedMultiplier(-5)).toBeCloseTo(0.15, 6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/materials.test.ts`
Expected: FAIL — `fallSpeedMultiplier` undefined.

- [ ] **Step 3: Implement**

Add to the bottom of `materials.ts`:

```typescript
const FALL_BASE = 0.15;
const FALL_PER_LEVEL = 0.10;

export function fallSpeedMultiplier(level: number): number {
  return FALL_BASE + Math.max(0, level) * FALL_PER_LEVEL;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/materials.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/materials.ts src/game/materials.test.ts
git commit -m "materials: add fallSpeedMultiplier formula"
```

---

### Task 4: Remove triangles from `shape.ts` + `circularShapeGenerator.ts`

**Files:**
- Modify: `src/game/shape.ts`
- Modify: `src/game/circularShapeGenerator.ts`
- Modify: `src/game/circularShapeGenerator.test.ts`

- [ ] **Step 1: Delete triangle artifacts from `shape.ts`**

Replace the full contents of `src/game/shape.ts` with:

```typescript
export interface ChunkCell {
  readonly x: number;
  readonly y: number;
}

export type CellKey = string;

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

/** A single chunk within a cell. Squares-only after Phase 6. */
export interface ChunkEntry {
  readonly chunkId: string; // unique within the asteroid, e.g. "0,0:0"
  readonly cell: ChunkCell;
}

export function makeChunkId(key: CellKey, index: number): string {
  return `${key}:${index}`;
}

export interface AsteroidShape {
  readonly cells: readonly ChunkCell[];
  readonly chunksByCell: ReadonlyMap<CellKey, readonly ChunkEntry[]>;
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>; // keyed by chunkId
  /** ChunkId of the centroid (seed) chunk, reserved for future core mechanic. */
  readonly coreChunkId: string;
}

export function canonicalEdge(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
```

(Removed: `ChunkShape`, `TRIANGLE_COMPLEMENT`. Added: `coreChunkId` on `AsteroidShape`.)

- [ ] **Step 2: Rewrite `circularShapeGenerator.ts` without triangle branches**

Replace the full contents of `src/game/circularShapeGenerator.ts` with:

```typescript
import type { SeededRng } from './rng';
import {
  cellKey,
  makeChunkId,
  type AsteroidShape,
  type CellKey,
  type ChunkCell,
  type ChunkEntry,
} from './shape';

export class CircularShapeGenerator {
  constructor(private readonly rng: SeededRng) {}

  generate(targetChunkCount: number): AsteroidShape {
    const target = Math.max(1, targetChunkCount);

    const cells: ChunkCell[] = [];
    const chunksByCell = new Map<CellKey, ChunkEntry[]>();
    const adjacency = new Map<string, Set<string>>();
    let totalChunks = 0;
    let coreChunkId = '';

    const placeCell = (cell: ChunkCell): string => {
      const key = cellKey(cell.x, cell.y);
      const isNew = !chunksByCell.has(key);
      if (isNew) cells.push(cell);

      const entries = chunksByCell.get(key) ?? [];
      const idx = entries.length;
      const id = makeChunkId(key, idx);
      const entry: ChunkEntry = { chunkId: id, cell };
      entries.push(entry);
      chunksByCell.set(key, entries);
      adjacency.set(id, new Set());

      // Connect to chunks in neighboring cells (square edges share with any neighbor).
      for (const nb of this.gridNeighbors(cell)) {
        const nbKey = cellKey(nb.x, nb.y);
        const nbEntries = chunksByCell.get(nbKey);
        if (!nbEntries) continue;
        for (const nbEntry of nbEntries) {
          adjacency.get(id)!.add(nbEntry.chunkId);
          adjacency.get(nbEntry.chunkId)!.add(id);
        }
      }

      totalChunks++;
      return id;
    };

    // Seed cell = centroid = future core slot.
    const seed: ChunkCell = { x: 0, y: 0 };
    coreChunkId = placeCell(seed);

    const candidates = new Map<CellKey, ChunkCell>();
    this.queueNeighborsAsCandidates(seed, candidates, chunksByCell);

    while (totalChunks < target && candidates.size > 0) {
      const chosen = this.pickWeightedCandidate(candidates, cells);
      const key = cellKey(chosen.x, chosen.y);
      candidates.delete(key);

      placeCell(chosen);

      this.queueNeighborsAsCandidates(chosen, candidates, chunksByCell);
    }

    return { cells, chunksByCell, adjacency, coreChunkId };
  }

  private pickWeightedCandidate(
    candidates: Map<CellKey, ChunkCell>,
    placed: readonly ChunkCell[],
  ): ChunkCell {
    let cx = 0;
    let cy = 0;
    for (const c of placed) {
      cx += c.x;
      cy += c.y;
    }
    cx /= placed.length;
    cy /= placed.length;

    const weights: Array<{ cell: ChunkCell; weight: number }> = [];
    let totalWeight = 0;

    for (const cell of candidates.values()) {
      const dx = cell.x - cx;
      const dy = cell.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const w = 1 / (dist + 0.5);
      weights.push({ cell, weight: w });
      totalWeight += w;
    }

    let roll = this.rng.next() * totalWeight;
    for (const entry of weights) {
      roll -= entry.weight;
      if (roll <= 0) return entry.cell;
    }
    return weights[weights.length - 1].cell;
  }

  private queueNeighborsAsCandidates(
    cell: ChunkCell,
    candidates: Map<CellKey, ChunkCell>,
    placed: Map<CellKey, ChunkEntry[]>,
  ): void {
    for (const nb of this.gridNeighbors(cell)) {
      const key = cellKey(nb.x, nb.y);
      if (!placed.has(key)) candidates.set(key, nb);
    }
  }

  private *gridNeighbors(cell: ChunkCell): Generator<ChunkCell> {
    yield { x: cell.x + 1, y: cell.y };
    yield { x: cell.x - 1, y: cell.y };
    yield { x: cell.x, y: cell.y + 1 };
    yield { x: cell.x, y: cell.y - 1 };
  }
}
```

- [ ] **Step 3: Rewrite tests in `circularShapeGenerator.test.ts`**

Replace the full contents with:

```typescript
import { describe, expect, it } from 'vitest';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { SeededRng } from './rng';
import { connectedComponents } from './connectedComponents';

function totalChunks(shape: ReturnType<CircularShapeGenerator['generate']>): number {
  let count = 0;
  for (const entries of shape.chunksByCell.values()) count += entries.length;
  return count;
}

describe('CircularShapeGenerator', () => {
  it('produces exactly the requested chunk count (squares-only)', () => {
    const gen = new CircularShapeGenerator(new SeededRng(12345));
    const shape = gen.generate(11);
    expect(totalChunks(shape)).toBe(11);
    expect(shape.adjacency.size).toBe(11);
  });

  it('produces a fully connected adjacency graph', () => {
    const gen = new CircularShapeGenerator(new SeededRng(9001));
    const shape = gen.generate(14);
    const components = connectedComponents(shape.adjacency);
    expect(components).toHaveLength(1);
    expect(components[0]).toHaveLength(totalChunks(shape));
  });

  it('is deterministic for the same seed', () => {
    const a = new CircularShapeGenerator(new SeededRng(42)).generate(10);
    const b = new CircularShapeGenerator(new SeededRng(42)).generate(10);
    expect(a.cells).toEqual(b.cells);
    expect(totalChunks(a)).toBe(totalChunks(b));
  });

  it('handles a 1-chunk shape', () => {
    const gen = new CircularShapeGenerator(new SeededRng(1));
    const shape = gen.generate(1);
    expect(shape.cells).toHaveLength(1);
    expect(shape.cells[0]).toEqual({ x: 0, y: 0 });
    expect(totalChunks(shape)).toBe(1);
  });

  it('marks the centroid (seed cell) as coreChunkId', () => {
    const gen = new CircularShapeGenerator(new SeededRng(77));
    const shape = gen.generate(9);
    // Core chunk should exist in the cell at (0,0)
    const seedEntries = shape.chunksByCell.get('0,0');
    expect(seedEntries?.some((e) => e.chunkId === shape.coreChunkId)).toBe(true);
  });

  it('only connects chunks in neighboring cells (no hypotenuse quirks)', () => {
    const gen = new CircularShapeGenerator(new SeededRng(555));
    const shape = gen.generate(15);
    for (const [id, neighbors] of shape.adjacency) {
      for (const nbId of neighbors) {
        let foundId = false;
        let foundNb = false;
        for (const entries of shape.chunksByCell.values()) {
          for (const e of entries) {
            if (e.chunkId === id) foundId = true;
            if (e.chunkId === nbId) foundNb = true;
          }
        }
        expect(foundId).toBe(true);
        expect(foundNb).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/circularShapeGenerator.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/shape.ts src/game/circularShapeGenerator.ts src/game/circularShapeGenerator.test.ts
git commit -m "shape: remove triangle variants, add coreChunkId to AsteroidShape"
```

---

### Task 5: Add `asteroidQuality` and `asteroidFallSpeed` upgrades

**Files:**
- Modify: `src/game/weaponCatalog.ts`
- Modify: `src/game/upgradeApplier.ts`
- Modify: `src/game/upgradeApplier.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `upgradeApplier.test.ts` inside the `describe('applyUpgrades', …)` block:

```typescript
it('raises qualityLevel per asteroid-quality level', () => {
  expect(applyUpgrades({}).qualityLevel).toBe(0);
  expect(applyUpgrades({ 'asteroids.quality': 5 }).qualityLevel).toBe(5);
});

it('scales fallSpeedMultiplier per asteroid-fallSpeed level', () => {
  expect(applyUpgrades({}).fallSpeedMultiplier).toBeCloseTo(0.15);
  expect(applyUpgrades({ 'asteroids.fallSpeed': 3 }).fallSpeedMultiplier).toBeCloseTo(0.45);
});
```

Add to `describe('weaponCatalog + upgradeCatalog', …)`:

```typescript
it('includes asteroidQuality and asteroidFallSpeed in Asteroids category', () => {
  const ids = allUpgradeDefs().map((u) => u.id);
  expect(ids).toContain('asteroids.quality');
  expect(ids).toContain('asteroids.fallSpeed');
  expect(findUpgrade('asteroids.quality')?.category).toBe('asteroids');
  expect(findUpgrade('asteroids.fallSpeed')?.category).toBe('asteroids');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/upgradeApplier.test.ts`
Expected: FAIL — missing properties / upgrade defs.

- [ ] **Step 3: Add two upgrade defs to `weaponCatalog.ts`**

In the `asteroids` entry of `CATEGORY_DEFS`, append after `asteroidSize`:

```typescript
      {
        id: 'asteroids.quality',
        name: 'Asteroid Quality',
        description: 'Unlocks and weights higher-tier materials',
        category: 'asteroids',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 9,
      },
      {
        id: 'asteroids.fallSpeed',
        name: 'Fall Speed',
        description: 'Asteroids fall faster',
        category: 'asteroids',
        baseCost: 1,
        growthRate: 1,
        maxLevel: 9,
      },
```

- [ ] **Step 4: Extend `EffectiveGameplayParams` and `BASE_PARAMS`**

In `upgradeApplier.ts`, add import at top:

```typescript
import { fallSpeedMultiplier } from './materials';
```

Add to `EffectiveGameplayParams` (after `blackholeMaxTargets`):

```typescript
  readonly qualityLevel: number;
  readonly fallSpeedMultiplier: number;
```

Add to `BASE_PARAMS`:

```typescript
  qualityLevel: 0,
  fallSpeedMultiplier: 0.15,
```

Add to the returned object in `applyUpgrades`:

```typescript
    qualityLevel: lv('asteroids.quality'),
    fallSpeedMultiplier: fallSpeedMultiplier(lv('asteroids.fallSpeed')),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/game/upgradeApplier.test.ts`
Expected: PASS (existing tests still green, new ones pass).

- [ ] **Step 6: Commit**

```bash
git add src/game/weaponCatalog.ts src/game/upgradeApplier.ts src/game/upgradeApplier.test.ts
git commit -m "upgrades: add asteroidQuality and asteroidFallSpeed"
```

---

### Task 6: Rewrite `Asteroid` to carry material + isCore per chunk

**Files:**
- Modify: `src/game/asteroid.ts`

- [ ] **Step 1: Replace full contents of `asteroid.ts`**

```typescript
import Phaser from 'phaser';
import type { AsteroidShape } from './shape';
import { canonicalEdge } from './shape';
import { type Material, textureKeyFor } from './materials';

export const CHUNK_PIXEL_SIZE = 12;

interface ChunkState {
  image: Phaser.Physics.Matter.Image;
  hp: number;
  maxHp: number;
  dead: boolean;
  material: Material;
  isCore: boolean;
}

export class Asteroid {
  private readonly scene: Phaser.Scene;
  private readonly chunks = new Map<string, ChunkState>();
  private readonly adjacency = new Map<string, Set<string>>();
  private readonly constraintsByEdge = new Map<string, unknown[]>();

  constructor(
    scene: Phaser.Scene,
    shape: AsteroidShape,
    spawnX: number,
    spawnY: number,
    hpMultiplier: number,
    fallSpeedMultiplier: number,
    materialsByChunk: ReadonlyMap<string, Material>,
    chunkRegistry: Set<Phaser.Physics.Matter.Image>,
  ) {
    this.scene = scene;

    for (const [k, v] of shape.adjacency) {
      this.adjacency.set(k, new Set(v));
    }

    // Center the asteroid cloud on (spawnX, spawnY) via the cell centroid.
    let sumX = 0;
    let sumY = 0;
    for (const c of shape.cells) {
      sumX += c.x;
      sumY += c.y;
    }
    const avgX = sumX / shape.cells.length;
    const avgY = sumY / shape.cells.length;
    const originX = spawnX - avgX * CHUNK_PIXEL_SIZE;
    const originY = spawnY + avgY * CHUNK_PIXEL_SIZE;

    for (const [, entries] of shape.chunksByCell) {
      for (const entry of entries) {
        const material = materialsByChunk.get(entry.chunkId);
        if (!material) continue;
        const maxHp = material.tier * hpMultiplier;
        const isCore = entry.chunkId === shape.coreChunkId;

        const wx = originX + entry.cell.x * CHUNK_PIXEL_SIZE;
        const wy = originY - entry.cell.y * CHUNK_PIXEL_SIZE;

        const image = scene.matter.add.image(wx, wy, textureKeyFor(material));
        image.setRectangle(CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
        image.setMass(0.25);
        image.setFriction(0.1);
        image.setFrictionAir(0.005);
        image.setBounce(0);
        (image.body as unknown as { slop: number }).slop = 0.005;
        (image.body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
          x: 0, y: fallSpeedMultiplier,
        };
        image.setData('kind', 'chunk');
        image.setData('asteroid', this);
        image.setData('chunkId', entry.chunkId);
        image.setData('hp', maxHp);
        image.setData('maxHp', maxHp);
        image.setData('tier', material.tier);
        image.setData('material', material);
        image.setData('isCore', isCore);
        image.setData('dead', false);

        this.chunks.set(entry.chunkId, {
          image,
          hp: maxHp,
          maxHp,
          dead: false,
          material,
          isCore,
        });
        chunkRegistry.add(image);
      }
    }

    // Weld each adjacent pair with two rigid, damped constraints.
    const seen = new Set<string>();
    for (const [aId, neighbors] of this.adjacency) {
      for (const bId of neighbors) {
        const edge = canonicalEdge(aId, bId);
        if (seen.has(edge)) continue;
        seen.add(edge);

        const a = this.chunks.get(aId);
        const b = this.chunks.get(bId);
        if (!a || !b) continue;

        const constraints = this.weldBodies(a.image, b.image);
        this.constraintsByEdge.set(edge, constraints);
      }
    }
  }

  damageChunkByImage(
    image: Phaser.Physics.Matter.Image,
    amount: number,
  ): { hp: number; killed: boolean; key: string | null } {
    const chunkId = image.getData('chunkId') as string | undefined;
    if (!chunkId) return { hp: 0, killed: false, key: null };
    const state = this.chunks.get(chunkId);
    if (!state || state.dead) return { hp: 0, killed: false, key: chunkId };

    state.hp -= amount;
    image.setData('hp', state.hp);

    if (state.hp <= 0) {
      state.dead = true;
      image.setData('dead', true);
      // Dead chunks keep the live texture but darken + shrink visually.
      image.setAlpha(0.55);
      image.setScale(0.8);
      // Restore default gravity on death so confetti stays snappy.
      (image.body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
        x: 0, y: 1,
      };
      this.detachChunk(chunkId);
      return { hp: 0, killed: true, key: chunkId };
    }

    return { hp: state.hp, killed: false, key: chunkId };
  }

  /** Refresh the fall-speed multiplier for all still-live chunks. */
  refreshFallSpeed(multiplier: number): void {
    for (const state of this.chunks.values()) {
      if (state.dead) continue;
      (state.image.body as unknown as { gravityScale: { x: number; y: number } }).gravityScale = {
        x: 0, y: multiplier,
      };
    }
  }

  private detachChunk(chunkId: string): void {
    const neighbors = this.adjacency.get(chunkId);
    if (!neighbors) return;

    for (const nbId of neighbors) {
      const edge = canonicalEdge(chunkId, nbId);
      const cs = this.constraintsByEdge.get(edge);
      if (cs) {
        for (const c of cs) {
          const world = this.scene.matter.world as unknown as {
            remove: (body: unknown) => void;
          };
          world.remove(c);
        }
        this.constraintsByEdge.delete(edge);
      }
      this.adjacency.get(nbId)?.delete(chunkId);
    }

    this.adjacency.delete(chunkId);
  }

  private weldBodies(
    a: Phaser.Physics.Matter.Image,
    b: Phaser.Physics.Matter.Image,
  ): unknown[] {
    const half = CHUNK_PIXEL_SIZE / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const mkConstraint = (
      pointA: { x: number; y: number },
      pointB: { x: number; y: number },
    ): unknown => {
      const factory = this.scene.matter.add as unknown as {
        constraint: (
          bodyA: unknown,
          bodyB: unknown,
          length: number,
          stiffness: number,
          options: {
            pointA: { x: number; y: number };
            pointB: { x: number; y: number };
            damping?: number;
          },
        ) => unknown;
      };
      return factory.constraint(a, b, 0, 1, { pointA, pointB, damping: 0.1 });
    };

    // Square-only chunks in adjacent cells — no same-cell case anymore.
    if (Math.abs(dx) > Math.abs(dy)) {
      const sign = dx > 0 ? 1 : -1;
      return [
        mkConstraint({ x: sign * half, y: -half }, { x: -sign * half, y: -half }),
        mkConstraint({ x: sign * half, y: half }, { x: -sign * half, y: half }),
      ];
    }

    const sign = dy > 0 ? 1 : -1;
    return [
      mkConstraint({ x: -half, y: sign * half }, { x: -half, y: -sign * half }),
      mkConstraint({ x: half, y: sign * half }, { x: half, y: -sign * half }),
    ];
  }
}
```

Changes from previous version:
- Removed `lightenColor`, `TEXTURE_KEY_BY_SHAPE`, triangle same-cell paired-weld branch.
- `ChunkState` carries `material` + `isCore`, drops `baseColor` / `deadColor`.
- Constructor takes `hpMultiplier` + `fallSpeedMultiplier` + `materialsByChunk`.
- Chunk `maxHp = material.tier * hpMultiplier`.
- Per-chunk `body.gravityScale = { x: 0, y: fallSpeedMultiplier }` on spawn.
- On death: `setAlpha(0.55)` (matches the "brightness 0.55" treatment from the spec) instead of `setTint(deadColor)`; restore `gravityScale = 1`.
- Weld constraint gains `damping: 0.1`.
- New `refreshFallSpeed` method for the live upgrade-refresh path in Task 9.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: errors at call sites in `asteroidSpawner.ts` and `GameScene.ts` — those are fixed in Tasks 7 and 9.

- [ ] **Step 3: Commit**

Asteroid typechecks clean on its own but callers are stale. Commit as WIP milestone:

```bash
git add src/game/asteroid.ts
git commit -m "asteroid: carry material+isCore per chunk, remove triangles"
```

---

### Task 7: Update `AsteroidSpawner` to roll per-chunk materials

**Files:**
- Modify: `src/game/asteroidSpawner.ts`

- [ ] **Step 1: Replace full contents of `asteroidSpawner.ts`**

```typescript
import type Phaser from 'phaser';
import { Asteroid } from './asteroid';
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
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly chunkRegistry: Set<Phaser.Physics.Matter.Image>,
  ) {}

  spawnOne(worldX: number, worldY: number, params: AsteroidSpawnParams): Asteroid {
    const seed = (Math.random() * 0xffffffff) >>> 0 || 1;
    const rng = new SeededRng(seed);

    const span = Math.max(0, params.maxChunks - params.minChunks);
    const count = params.minChunks + rng.nextInt(span + 1);

    const generator = new CircularShapeGenerator(rng);
    const shape = generator.generate(count);

    // Roll a material per chunk from the quality-weighted distribution.
    const materialsByChunk = new Map<string, Material>();
    for (const entries of shape.chunksByCell.values()) {
      for (const entry of entries) {
        materialsByChunk.set(entry.chunkId, chooseMaterial(params.qualityLevel, rng));
      }
    }

    return new Asteroid(
      this.scene,
      shape,
      worldX,
      worldY,
      params.hpMultiplier,
      params.fallSpeedMultiplier,
      materialsByChunk,
      this.chunkRegistry,
    );
  }
}
```

Changes:
- `AsteroidSpawnParams` rename: `maxHpPerChunk` → `hpMultiplier`; add `qualityLevel` + `fallSpeedMultiplier`.
- Drop `triProb` constants, `randomPaletteColor` import, single-color spawn.
- Build `materialsByChunk` map by rolling `chooseMaterial` per chunk.

- [ ] **Step 2: Typecheck to find callers**

Run: `npx tsc --noEmit`
Expected: still breaks at `GameScene.spawnAsteroid` — fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/game/asteroidSpawner.ts
git commit -m "spawner: roll per-chunk materials via quality distribution"
```

---

### Task 8: Render the 9 material textures in `GameScene`

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Replace `makeChunkTextures` in `GameScene.ts`**

Replace lines 494–526 (the `makeChunkTextures` method and triangle helpers) with:

```typescript
  // ── procedural textures ────────────────────────────────────────────────

  private makeChunkTextures(): void {
    for (const material of MATERIALS) {
      this.drawMaterialTexture(material);
    }
  }

  private drawMaterialTexture(material: Material): void {
    const size = CHUNK_PIXEL_SIZE;
    const key = textureKeyFor(material);
    if (material.hasGlow) {
      const pad = 3;
      const total = size + pad * 2;
      const ct = this.textures.createCanvas(key, total, total);
      if (!ct) return;
      const ctx = ct.getContext();

      // Radial glow halo behind the chunk.
      const grad = ctx.createRadialGradient(total / 2, total / 2, size * 0.1, total / 2, total / 2, total / 2);
      grad.addColorStop(0, material.glowColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, total, total);

      this.drawChunkBody(ctx, pad, pad, size, material);
      ct.refresh();
      return;
    }
    const ct = this.textures.createCanvas(key, size, size);
    if (!ct) return;
    const ctx = ct.getContext();
    this.drawChunkBody(ctx, 0, 0, size, material);
    ct.refresh();
  }

  private drawChunkBody(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, size: number,
    material: Material,
  ): void {
    // Linear gradient at 135° (top-left → bottom-right) with 3 stops.
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, material.fillColors[0]);
    grad.addColorStop(0.5, material.fillColors[1]);
    grad.addColorStop(1, material.fillColors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);

    // Border (1px darker outline).
    ctx.strokeStyle = material.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    // Metal + Gem inset highlight (1px top-left).
    if (material.band !== 'earth') {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
```

Add imports at the top of `GameScene.ts` (after existing imports):

```typescript
import { MATERIALS, type Material, textureKeyFor } from '../game/materials';
```

- [ ] **Step 2: Verify no typecheck regressions from texture code**

Run: `npx tsc --noEmit`
Expected: texture code typechecks. Other errors (`spawnAsteroid`, `collectAtDeathLine`) are addressed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "scene: draw 9 material textures via canvas gradients + gem glow"
```

---

### Task 9: Wire spawner, reward, upgrade-refresh, and Matter config in `GameScene`

**Files:**
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/main.ts` (if Matter `constraintIterations` lives there — verify first)

- [ ] **Step 1: Bump `constraintIterations` in `src/main.ts`**

The Phaser Matter config lives in `main.ts`. Currently `constraintIterations: 4`. Change it to `8`:

```typescript
// src/main.ts, inside physics.matter config
constraintIterations: 8,
```

Leave `positionIterations: 20` and `velocityIterations: 14` as-is (already tuned).

- [ ] **Step 3: Update `GameScene.spawnAsteroid` to pass new params**

Replace the body of `spawnAsteroid` (around line 334) with:

```typescript
  private spawnAsteroid(): void {
    const beforeSize = this.chunkImages.size;
    const halfW = this.scale.width / 2;
    const jitter = (Math.random() - 0.5) * (this.effectiveParams.channelHalfWidth * 0.6);
    this.spawner.spawnOne(halfW + jitter, SPAWN_Y, {
      minChunks: this.effectiveParams.minChunks,
      maxChunks: this.effectiveParams.maxChunks,
      hpMultiplier: this.effectiveParams.maxHpPerChunk,
      qualityLevel: this.effectiveParams.qualityLevel,
      fallSpeedMultiplier: this.effectiveParams.fallSpeedMultiplier,
    });
    this.spawnedCount++;
    this.spawnedChunks += this.chunkImages.size - beforeSize;
  }
```

Note: `maxHpPerChunk` from `EffectiveGameplayParams` now feeds `hpMultiplier` — the field name is unchanged but the semantic is "multiplier for tier-based HP." Rename the field in `BASE_PARAMS` from `maxHpPerChunk` → `hpMultiplier` if you want semantic consistency; that's out of scope here (keep field name, reinterpret value). The existing Chunk HP upgrade `'asteroids.chunkHp'` adds +1 per level starting from base 3, giving multipliers 3, 4, 5, …

Actually — base 3 is the wrong multiplier for the linked model. **Update `BASE_PARAMS.maxHpPerChunk` from `3` to `1`** so the tier-as-HP formula works at level 0. With L0 upgrade and L0 Quality: Dirt = tier 1 × multiplier 1 = 1 HP. With +2 Chunk HP: Dirt = 3 HP. That matches the design's "global HP upgrade multiplies across the ladder."

Add to the same step:

```typescript
// In upgradeApplier.ts BASE_PARAMS:
maxHpPerChunk: 1,  // now a per-tier multiplier, not an absolute HP
```

And update the existing chunkHp test in `upgradeApplier.test.ts`:

```typescript
it('raises chunk HP multiplier per level', () => {
  expect(applyUpgrades({ 'asteroids.chunkHp': 7 }).maxHpPerChunk).toBe(1 + 7);
});
```

(Test file change: swap the `BASE_PARAMS.maxHpPerChunk + 7` line for the above literal, since the base value changed.)

- [ ] **Step 4: Update `collectAtDeathLine` reward formula**

Replace lines 448–471 in `GameScene.ts` with:

```typescript
  private collectAtDeathLine(chunk: Phaser.Physics.Matter.Image): void {
    const asteroid = chunk.getData('asteroid') as Asteroid | undefined;
    const dead = chunk.getData('dead') as boolean;
    const tier = (chunk.getData('tier') as number | undefined) ?? 1;

    if (!dead && asteroid) {
      asteroid.damageChunkByImage(chunk, Number.POSITIVE_INFINITY);
    }

    if (dead) {
      const amount = tier; // linked model: reward = tier
      gameplayState.addCash(amount);
      this.cashFromSaw += amount;
      this.collectedDead++;
      this.spawnConfetti(chunk.x, chunk.y);
    } else {
      // Escaped live chunk to the death line — flat $1 consolation (unchanged).
      gameplayState.addCash(1);
      this.cashFromLine += 1;
      this.collectedAlive++;
    }

    this.chunkImages.delete(chunk);
    chunk.destroy();
  }
```

- [ ] **Step 5: Wire fall-speed refresh to the upgrade event**

Find the `recomputeEffectiveParams` method (around line 317). After the existing bail-outs, add a refresh for live asteroids:

```typescript
  private recomputeEffectiveParams(): void {
    const prev = this.effectiveParams;
    this.effectiveParams = applyUpgrades(gameplayState.levels());

    for (const inst of this.weaponInstances) {
      inst.behavior.onUpgrade(this, inst.sprite, prev, this.effectiveParams);
    }
    if (this.effectiveParams.channelHalfWidth !== prev.channelHalfWidth) {
      this.rebuildChannelWalls(this.effectiveParams.channelHalfWidth);
    }
    if (this.effectiveParams.spawnIntervalMs !== prev.spawnIntervalMs) {
      this.rebuildSpawnTimer(this.effectiveParams.spawnIntervalMs);
    }
    if (this.effectiveParams.fallSpeedMultiplier !== prev.fallSpeedMultiplier) {
      this.refreshAllAsteroidsFallSpeed(this.effectiveParams.fallSpeedMultiplier);
    }
  }

  private refreshAllAsteroidsFallSpeed(multiplier: number): void {
    // Track active asteroids by their chunks' 'asteroid' data reference.
    const seen = new Set<Asteroid>();
    for (const chunk of this.chunkImages) {
      const a = chunk.getData('asteroid') as Asteroid | undefined;
      if (a && !seen.has(a)) {
        a.refreshFallSpeed(multiplier);
        seen.add(a);
      }
    }
  }
```

- [ ] **Step 6: Run vitest + typecheck**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: typecheck clean; all 57+ existing tests still green (possibly 60+ with the new ones from Tasks 1–5).

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.ts src/game/upgradeApplier.ts src/game/upgradeApplier.test.ts src/main.ts
git commit -m "scene: wire materials, reward-by-tier, fall-speed refresh, matter bump"
```

---

### Task 10: Live Chrome verification

**Files:** none modified — this task is manual verification.

- [ ] **Step 1: Start the dev server**

Run in a separate terminal: `npm run dev`
Open http://127.0.0.1:5173 in Chrome (NOT the preview tool — per global CLAUDE.md, always use Chrome for visual verification).

- [ ] **Step 2: Smoke-test the baseline (Quality L0, Fall Speed L0)**

- Arena loads without errors in the Chrome console.
- Asteroids spawn as **only Dirt** (brown matte chunks).
- Asteroids fall visibly slowly.
- Saw / laser / missile / blackhole all still hit chunks and kill them.
- Dead chunks confetti snappily (restored gravityScale).
- Cash ticks up by tier=1 per dead Dirt chunk.

- [ ] **Step 3: Quality progression test**

- Buy Asteroid Quality L1: Stone (grey) starts appearing.
- Buy up to Q4: see Dirt/Stone/Copper/Silver/Gold mix.
- Buy up to Q8: eventually a Ruby/Emerald/Sapphire/Diamond chunk spawns with a visible glow halo.
- Verify cash per chunk scales with tier (e.g. a Gold chunk dead = $5).

- [ ] **Step 4: Fall Speed progression test**

- Base (L0) asteroids drift down over ~several seconds.
- Bump Fall Speed to L5: drift visibly accelerates.
- Bump to L9: asteroids fall at roughly normal-game speed.
- Chunk HP multiplier (Chunk HP upgrade) does not affect reward — HP goes up but $ per dead chunk stays at tier.

- [ ] **Step 5: Squishiness check**

- Queue a pile of asteroids against the saw + channel walls.
- Welds should look rigid — no visible oscillation or squish under load.
- Confetti debris after saw hits still behaves snappily.

- [ ] **Step 6: Console + perf**

- No Matter warnings.
- No missing-texture errors (no `chunk-square`, `chunk-tri-*` requests).
- FPS (via `?debug=1`) stays at 60 with full arena.

- [ ] **Step 7: Capture a screenshot into the branch**

Save a Chrome screenshot of the grind at Q8 showing a gem drop to `/tmp/phase6-q8-gem.png` for use in the PR description (don't commit).

- [ ] **Step 8: Commit any discovered fix-ups**

If Step 3–6 surfaced small bugs, fix them inline. Commit as:

```bash
git add <files>
git commit -m "fix: <specific issue>"
```

If no issues found, no commit.

---

### Task 11: Code review (fresh reviewer agent)

**Files:** none — this task dispatches a review agent.

Per global CLAUDE.md: "Multi-step implementation plans must include a code-review pass as the second-to-last phase, before final verification. Dispatch a fresh reviewer agent so it has no implementation bias."

- [ ] **Step 1: Dispatch the review agent**

Use the `feature-dev:code-reviewer` subagent with this prompt:

> "Review the Phase 6 asteroid overhaul branch `feature/phase-6-asteroid-overhaul` against the spec at `docs/superpowers/specs/2026-04-16-asteroid-overhaul-design.md`. Focus: (1) does the implementation match the spec (materials ladder, Quality upgrade, Fall Speed upgrade, triangle removal, weld damping, constraint-iterations bump, centroid `isCore` tag, reward-by-tier)? (2) physics concerns around per-body `gravityScale` mutation — is it set on the right axes, restored correctly on chunk death, and refreshed on upgrade? (3) code quality: file boundaries, duplication between `materials.ts` and `GameScene` texture code, any `any`-casts that should be narrowed. (4) tests: coverage of the distribution logic, generator square-only paths, and the new upgrade plumbing. Report high-confidence issues only — ignore stylistic nits."

- [ ] **Step 2: Address review findings**

For each confirmed issue, fix it inline, commit separately with a message like `review: <fix description>`. If the reviewer disagrees with a design decision already locked in the spec, push back in a reply rather than changing the code — the spec is approved.

- [ ] **Step 3: Re-run tests after fixes**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

All three must pass.

---

### Task 12: Docs + final verification + FF merge

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `CLAUDE.md` (if any new gotchas surfaced)

- [ ] **Step 1: Mark Phase 6 done in `ROADMAP.md`**

Change the Phase 6 line from `pending` to `done (YYYY-MM-DD)` with a one-line summary of what shipped.

Remove the "Current todos (Phase 5 — Weapons)" section entirely (Phase 5 is already shipped) and replace with either `Current todos (Phase 6 — Asteroid Overhaul)` showing the items from this plan as done, or remove the section if all work is complete.

- [ ] **Step 2: Update `README.md`**

Ensure the feature list reflects:
- 9-tier material ladder (Dirt → Diamond)
- Asteroid Quality upgrade
- Fall Speed upgrade
- Squares-only chunk system (triangles removed)

- [ ] **Step 3: Update `CLAUDE.md` if needed**

If during implementation you hit a Phaser/Matter gotcha worth preserving (e.g. per-body `gravityScale` has `{x, y}` shape not a scalar; glow halos must be baked into texture pad, not applied via tint), add it to the "Phaser + Matter gotchas" section.

- [ ] **Step 4: Final verification gates**

Per global CLAUDE.md ship gates — all must pass:

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Plus a live playthrough in Chrome confirming Q0→Q8 progression and Fall Speed scaling.

- [ ] **Step 5: Commit doc updates**

```bash
git add ROADMAP.md README.md CLAUDE.md
git commit -m "docs: phase 6 asteroid overhaul shipped"
```

- [ ] **Step 6: Fast-forward merge to main**

Per global CLAUDE.md "fast-forward merge to main only after I've verified it locally" — **pause and ask the user** before running the merge.

Proposed commands (DO NOT RUN WITHOUT EXPLICIT USER GO-AHEAD):

```bash
git checkout main
git merge --ff-only feature/phase-6-asteroid-overhaul
git push origin main
```

- [ ] **Step 7: Delete local branch after successful merge**

```bash
git branch -d feature/phase-6-asteroid-overhaul
```
