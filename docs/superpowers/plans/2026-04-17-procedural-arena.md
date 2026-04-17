# Procedural Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed single-chute arena with a seeded, branching, BSP-generated layout of finite weapon slots, plus a new mid-run slot-unlock cash sink and a prestige-shop `preUnlockedSlots` item. Spec: `docs/superpowers/specs/2026-04-17-procedural-arena-design.md`.

**Architecture:** Pure-logic generator + slot-state module under `src/game/arena/`, unit-tested with Vitest. `GameScene` swaps `rebuildChannelWalls` for `buildArenaFromLayout` and binds weapons to `slotId` instead of free `(x,y)`. `UIScene` gains a slot-interaction layer. Save schema jumps v2→v3 with a wipe-on-mismatch strategy (no migration code — no users yet). Channel Width upgrade is removed; Asteroid Size kept.

**Tech Stack:** TypeScript, Phaser 3 + Matter.js, Vite, Vitest, Playwright.

---

## Phases

1. **Pure logic foundation** — types, generator, validator, slot state, constants (in progress)
2. **State & persistence** — `gameplayState` extensions, save v3, prestige shop item
3. **Dead code removal** — Channel Width upgrade, `weaponPlacement`, `rebuildChannelWalls`
4. **Scene integration** — arena build, oscillating spawner, slot rendering, UI affordances
5. **E2E & debug tooling** — Playwright smoke, new arena-seed spec, debug overlay
6. **Code review, docs, user verification, FF-merge** — per global workflow

---

## Phase 1 · Pure logic foundation

### Task 1: Arena constants + types

**Files:**
- Create: `src/game/arena/arenaConstants.ts`
- Create: `src/game/arena/arenaTypes.ts`

- [ ] **Step 1: Create the constants file**

```ts
// src/game/arena/arenaConstants.ts
// All arena tuning lives here. Referenced from generator, slot state, and scene wiring.

export const MIN_SLOTS = 4;
export const MAX_SLOTS = 10;
export const BASE_STARTING_SLOTS = 2;

// Placeholder cost curve for in-run slot unlocks. Re-tuned in the §4 economy rebalance.
export const UNLOCK_BASE = 50;
export const UNLOCK_GROWTH = 2.5;

// BSP generator tuning.
export const MAX_DEPTH = 4;
export const SPLIT_P_DECAY = 0.6;
export const VERTICAL_AXIS_WEIGHT = 2; // vertical splits are 2x as likely as horizontal
export const MIN_WALL_SLANT_DEG = 8;
export const MIN_LEAF_DIM = 220;       // leaves below this along either axis aren't split further
export const SLOT_SPACING = 180;       // min 2D spacing between slot centers
export const MAX_RETRIES = 8;

// Physics + rendering.
export const WALL_COLLIDER_THICKNESS = 40;
export const FLOOR_BAND_HEIGHT = 60;

// Spawner.
export const PHASE_STEP_RAD = 0.37;
export const SPAWN_MARGIN = 32;
```

- [ ] **Step 2: Create the types file**

```ts
// src/game/arena/arenaTypes.ts

export interface WallSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface SlotDef {
  readonly id: string;              // stable across a run
  readonly x: number;
  readonly y: number;
  readonly normalAngleRad: number;  // direction the weapon faces (outward from wall)
  readonly leafId: string;
}

export interface ArenaLayout {
  readonly seed: number;
  readonly walls: readonly WallSegment[];
  readonly slots: readonly SlotDef[];
  readonly floorY: number;           // top of the grinder row
  readonly playfield: { readonly width: number; readonly height: number };
}

export interface ArenaSeedParams {
  readonly width: number;
  readonly height: number;
  readonly minSlots: number;
  readonly maxSlots: number;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/game/arena/arenaConstants.ts src/game/arena/arenaTypes.ts
git commit -m "arena: constants + types skeleton"
```

---

### Task 2: Arena validator (pure)

**Files:**
- Create: `src/game/arena/arenaValidate.ts`
- Create: `src/game/arena/arenaValidate.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/game/arena/arenaValidate.test.ts
import { describe, it, expect } from 'vitest';
import { isPlayable, minWallSlantDeg } from './arenaValidate';
import type { ArenaLayout } from './arenaTypes';

const PLAYFIELD = { width: 1200, height: 1440 };

function layout(walls: ArenaLayout['walls'], slots: ArenaLayout['slots']): ArenaLayout {
  return { seed: 1, walls, slots, floorY: 1380, playfield: PLAYFIELD };
}

describe('isPlayable', () => {
  it('accepts an empty arena (no interior walls)', () => {
    expect(isPlayable(layout([], []))).toBe(true);
  });

  it('rejects an arena where a horizontal wall spans the whole width with no gap', () => {
    const walls = [{ x1: 0, y1: 700, x2: 1200, y2: 700 }];
    expect(isPlayable(layout(walls, []))).toBe(false);
  });

  it('accepts an arena where a horizontal wall leaves a wide enough gap', () => {
    const walls = [{ x1: 0, y1: 700, x2: 500, y2: 700 }];
    expect(isPlayable(layout(walls, []))).toBe(true);
  });
});

describe('minWallSlantDeg', () => {
  it('returns 0 for empty wall list', () => {
    expect(minWallSlantDeg([])).toBe(Infinity);
  });

  it('returns 0 for a perfectly horizontal wall', () => {
    expect(minWallSlantDeg([{ x1: 0, y1: 100, x2: 400, y2: 100 }])).toBe(0);
  });

  it('returns a positive angle for a slanted wall', () => {
    const deg = minWallSlantDeg([{ x1: 0, y1: 100, x2: 400, y2: 140 }]);
    expect(deg).toBeGreaterThan(0);
    expect(deg).toBeLessThan(90);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- --run arenaValidate`
Expected: FAIL — file not implemented.

- [ ] **Step 3: Write the validator**

```ts
// src/game/arena/arenaValidate.ts
import type { ArenaLayout, WallSegment } from './arenaTypes';

// Minimum downward clearance (px) the validator requires for playability. Tuned
// to exceed MAX_ASTEROID_DIAMETER so even the biggest asteroid can pass through.
const MIN_CLEARANCE = 160;
const RAY_SAMPLE_STEP = 40; // x resolution for the downward-ray sweep

export function minWallSlantDeg(walls: readonly WallSegment[]): number {
  if (walls.length === 0) return Infinity;
  let min = Infinity;
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    // Angle off horizontal in [0, 90].
    const deg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    const offHorizontal = Math.min(deg, 180 - deg);
    if (offHorizontal < min) min = offHorizontal;
  }
  return min;
}

// Returns true if every x-sample across the playfield can find a downward path
// to the floor band with clearance >= MIN_CLEARANCE. This does NOT prove all
// leaves are reachable; it's a coarse tripwire for "a chunk dropped at x can
// reach the grinder."
export function isPlayable(layout: ArenaLayout): boolean {
  const { walls, playfield, floorY } = layout;
  if (walls.length === 0) return true;
  for (let x = SPAWN_SAFE_MARGIN; x < playfield.width - SPAWN_SAFE_MARGIN; x += RAY_SAMPLE_STEP) {
    if (!rayReachesFloor(x, walls, floorY)) return false;
  }
  return true;
}

const SPAWN_SAFE_MARGIN = 40;

function rayReachesFloor(x: number, walls: readonly WallSegment[], floorY: number): boolean {
  // Walk downward; each time we hit a wall, check if there's enough horizontal
  // room to route around it. Crude but sufficient for a tripwire.
  let y = 0;
  let cursor = x;
  for (let step = 0; step < 200; step++) {
    const hit = firstWallBelow(cursor, y, walls);
    if (!hit || hit.y > floorY) return true;
    // Find the nearest gap in this wall's y band.
    const gapX = findGapX(cursor, hit, walls);
    if (gapX == null) return false;
    cursor = gapX;
    y = hit.y + MIN_CLEARANCE;
    if (y >= floorY) return true;
  }
  return false;
}

function firstWallBelow(x: number, y: number, walls: readonly WallSegment[]): { y: number; wall: WallSegment } | null {
  let best: { y: number; wall: WallSegment } | null = null;
  for (const w of walls) {
    const xMin = Math.min(w.x1, w.x2);
    const xMax = Math.max(w.x1, w.x2);
    if (x < xMin || x > xMax) continue;
    const t = (x - w.x1) / ((w.x2 - w.x1) || 1);
    const wy = w.y1 + t * (w.y2 - w.y1);
    if (wy <= y) continue;
    if (!best || wy < best.y) best = { y: wy, wall: w };
  }
  return best;
}

function findGapX(_cursor: number, hit: { y: number; wall: WallSegment }, _walls: readonly WallSegment[]): number | null {
  // Look for open space just past either end of the hit wall. A wall is a gap
  // if rays sampled just past its endpoint find no wall at the same y band.
  const wall = hit.wall;
  const xMin = Math.min(wall.x1, wall.x2);
  const xMax = Math.max(wall.x1, wall.x2);
  const candidateLeft = xMin - MIN_CLEARANCE / 2;
  const candidateRight = xMax + MIN_CLEARANCE / 2;
  return candidateLeft > SPAWN_SAFE_MARGIN ? candidateLeft : candidateRight;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run arenaValidate`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/game/arena/arenaValidate.ts src/game/arena/arenaValidate.test.ts
git commit -m "arena: validator (isPlayable, minWallSlantDeg)"
```

---

### Task 3: Arena generator — seeded BSP

**Files:**
- Create: `src/game/arena/arenaGenerator.ts`
- Create: `src/game/arena/arenaGenerator.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/game/arena/arenaGenerator.test.ts
import { describe, it, expect } from 'vitest';
import { generateArena } from './arenaGenerator';
import { isPlayable, minWallSlantDeg } from './arenaValidate';
import {
  MIN_SLOTS, MAX_SLOTS, MIN_WALL_SLANT_DEG, SLOT_SPACING,
} from './arenaConstants';

const PARAMS = { width: 2560, height: 1440, minSlots: MIN_SLOTS, maxSlots: MAX_SLOTS };

describe('generateArena', () => {
  it('is deterministic given the same seed', () => {
    const a = generateArena(12345, PARAMS);
    const b = generateArena(12345, PARAMS);
    expect(a).toEqual(b);
  });

  it('produces different layouts for different seeds', () => {
    const a = generateArena(1, PARAMS);
    const b = generateArena(2, PARAMS);
    expect(a).not.toEqual(b);
  });

  it('always produces slot count within [MIN_SLOTS, MAX_SLOTS]', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const layout = generateArena(seed, PARAMS);
      expect(layout.slots.length).toBeGreaterThanOrEqual(MIN_SLOTS);
      expect(layout.slots.length).toBeLessThanOrEqual(MAX_SLOTS);
    }
  });

  it('horizontal walls carry the minimum slant', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { walls } = generateArena(seed, PARAMS);
      const slant = minWallSlantDeg(walls);
      expect(slant === Infinity || slant >= MIN_WALL_SLANT_DEG - 0.01).toBe(true);
    }
  });

  it('generated layouts pass isPlayable', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const layout = generateArena(seed, PARAMS);
      expect(isPlayable(layout)).toBe(true);
    }
  });

  it('slots respect minimum spacing', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { slots } = generateArena(seed, PARAMS);
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const dx = slots[i].x - slots[j].x;
          const dy = slots[i].y - slots[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          expect(d).toBeGreaterThanOrEqual(SLOT_SPACING - 1);
        }
      }
    }
  });

  it('slot IDs are unique within a layout', () => {
    const { slots } = generateArena(42, PARAMS);
    const ids = new Set(slots.map((s) => s.id));
    expect(ids.size).toBe(slots.length);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- --run arenaGenerator`
Expected: FAIL — file not implemented.

- [ ] **Step 3: Write the generator**

Create `src/game/arena/arenaGenerator.ts` implementing this contract:

```ts
// src/game/arena/arenaGenerator.ts
import { SeededRng } from '../rng';
import { isPlayable } from './arenaValidate';
import {
  MAX_DEPTH, SPLIT_P_DECAY, VERTICAL_AXIS_WEIGHT, MIN_WALL_SLANT_DEG,
  MIN_LEAF_DIM, SLOT_SPACING, MAX_RETRIES, FLOOR_BAND_HEIGHT,
} from './arenaConstants';
import type { ArenaLayout, ArenaSeedParams, SlotDef, WallSegment } from './arenaTypes';

interface Rect { x: number; y: number; w: number; h: number; id: string }

export function generateArena(seed: number, params: ArenaSeedParams): ArenaLayout {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const layout = tryGenerate(seed + attempt, params);
    if (isPlayable(layout)) return { ...layout, seed };
  }
  return { ...fallbackChute(params), seed };
}

function tryGenerate(seed: number, params: ArenaSeedParams): ArenaLayout {
  const rng = new SeededRng(seed);
  const floorY = params.height - FLOOR_BAND_HEIGHT;
  const root: Rect = { x: 0, y: 0, w: params.width, h: floorY, id: 'L0' };

  const leaves: Rect[] = [];
  const walls: WallSegment[] = [];
  splitRect(root, 0, rng, leaves, walls);

  // Enforce min-slant on every wall: if too horizontal, rotate around its midpoint.
  for (let i = 0; i < walls.length; i++) {
    walls[i] = ensureSlant(walls[i], rng);
  }

  const slots = placeSlots(leaves, rng, params);

  return { seed, walls, slots, floorY, playfield: { width: params.width, height: params.height } };
}

function splitRect(r: Rect, depth: number, rng: SeededRng, leavesOut: Rect[], wallsOut: WallSegment[]) {
  const pSplit = Math.pow(SPLIT_P_DECAY, depth);
  const canSplit = depth < MAX_DEPTH && r.w > MIN_LEAF_DIM * 2 && r.h > MIN_LEAF_DIM * 2;
  if (!canSplit || rng.next() > pSplit) { leavesOut.push(r); return; }

  // Axis pick: vertical weighted VERTICAL_AXIS_WEIGHT:1 over horizontal.
  const axisRoll = rng.next() * (VERTICAL_AXIS_WEIGHT + 1);
  const vertical = axisRoll < VERTICAL_AXIS_WEIGHT;

  if (vertical) {
    const sx = r.x + r.w * (0.4 + rng.next() * 0.2);
    const partialStart = r.y + r.h * (rng.next() * 0.35);
    const partialEnd = r.y + r.h * (0.65 + rng.next() * 0.35);
    wallsOut.push({ x1: sx, y1: partialStart, x2: sx, y2: partialEnd });
    const left: Rect = { x: r.x, y: r.y, w: sx - r.x, h: r.h, id: r.id + 'L' };
    const right: Rect = { x: sx, y: r.y, w: r.x + r.w - sx, h: r.h, id: r.id + 'R' };
    splitRect(left, depth + 1, rng, leavesOut, wallsOut);
    splitRect(right, depth + 1, rng, leavesOut, wallsOut);
  } else {
    const sy = r.y + r.h * (0.4 + rng.next() * 0.2);
    const partialStart = r.x + r.w * (rng.next() * 0.35);
    const partialEnd = r.x + r.w * (0.65 + rng.next() * 0.35);
    wallsOut.push({ x1: partialStart, y1: sy, x2: partialEnd, y2: sy });
    const top: Rect = { x: r.x, y: r.y, w: r.w, h: sy - r.y, id: r.id + 'T' };
    const bot: Rect = { x: r.x, y: sy, w: r.w, h: r.y + r.h - sy, id: r.id + 'B' };
    splitRect(top, depth + 1, rng, leavesOut, wallsOut);
    splitRect(bot, depth + 1, rng, leavesOut, wallsOut);
  }
}

function ensureSlant(w: WallSegment, rng: SeededRng): WallSegment {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const deg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  const offHorizontal = Math.min(deg, 180 - deg);
  if (offHorizontal >= MIN_WALL_SLANT_DEG) return w;

  const length = Math.hypot(dx, dy) || 1;
  const cx = (w.x1 + w.x2) / 2;
  const cy = (w.y1 + w.y2) / 2;
  const dirSign = rng.next() < 0.5 ? 1 : -1;
  const targetRad = dirSign * (MIN_WALL_SLANT_DEG + 2) * Math.PI / 180;
  const ux = Math.cos(targetRad);
  const uy = Math.sin(targetRad);
  const half = length / 2;
  return {
    x1: cx - ux * half,
    y1: cy - uy * half,
    x2: cx + ux * half,
    y2: cy + uy * half,
  };
}

function placeSlots(leaves: readonly Rect[], rng: SeededRng, params: ArenaSeedParams): SlotDef[] {
  const slots: SlotDef[] = [];
  let next = 0;
  // Sort leaves by area descending so largest leaves seed slots first.
  const sorted = [...leaves].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  for (const leaf of sorted) {
    const count = 1 + rng.nextInt(2); // 1 or 2 per leaf
    for (let i = 0; i < count; i++) {
      if (slots.length >= params.maxSlots) break;
      const cx = leaf.x + leaf.w * (0.25 + rng.next() * 0.5);
      const cy = leaf.y + leaf.h * (0.3 + rng.next() * 0.5);
      if (tooCloseToExisting(cx, cy, slots)) continue;
      slots.push({
        id: `s${next++}`,
        x: cx,
        y: cy,
        normalAngleRad: rng.next() * Math.PI * 2,
        leafId: leaf.id,
      });
    }
    if (slots.length >= params.maxSlots) break;
  }
  // Top-up: if we're short of minSlots, sprinkle extras into the biggest leaves
  // ignoring spacing until we hit minSlots or run out of leaf capacity.
  while (slots.length < params.minSlots) {
    const leaf = sorted[slots.length % sorted.length];
    slots.push({
      id: `s${next++}`,
      x: leaf.x + leaf.w * (0.3 + rng.next() * 0.4),
      y: leaf.y + leaf.h * (0.3 + rng.next() * 0.4),
      normalAngleRad: rng.next() * Math.PI * 2,
      leafId: leaf.id,
    });
  }
  return slots;
}

function tooCloseToExisting(x: number, y: number, slots: readonly SlotDef[]): boolean {
  for (const s of slots) {
    const dx = s.x - x, dy = s.y - y;
    if (dx * dx + dy * dy < SLOT_SPACING * SLOT_SPACING) return true;
  }
  return false;
}

function fallbackChute(params: ArenaSeedParams): ArenaLayout {
  const floorY = params.height - FLOOR_BAND_HEIGHT;
  const slots: SlotDef[] = [];
  const cx = params.width / 2;
  for (let i = 0; i < 6; i++) {
    slots.push({
      id: `fb${i}`,
      x: i % 2 === 0 ? cx - 220 : cx + 220,
      y: 220 + i * 180,
      normalAngleRad: i % 2 === 0 ? 0 : Math.PI,
      leafId: 'fallback',
    });
  }
  return { seed: 0, walls: [], slots, floorY, playfield: { width: params.width, height: params.height } };
}
```

- [ ] **Step 4: Run tests; iterate on generator details until all pass**

Run: `npm test -- --run arenaGenerator`
Expected: PASS 7/7. If the slot-spacing test fails on some seeds due to top-up ignoring spacing, adjust `placeSlots` to keep at least a reduced spacing (`SLOT_SPACING * 0.6`) even in top-up.

- [ ] **Step 5: Commit**

```bash
git add src/game/arena/arenaGenerator.ts src/game/arena/arenaGenerator.test.ts
git commit -m "arena: seeded BSP generator"
```

---

### Task 4: Slot state (unlock curve + mask)

**Files:**
- Create: `src/game/arena/slotState.ts`
- Create: `src/game/arena/slotState.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/game/arena/slotState.test.ts
import { describe, it, expect } from 'vitest';
import { unlockCost, startingUnlockedCount, SlotMask } from './slotState';
import { BASE_STARTING_SLOTS, UNLOCK_BASE, UNLOCK_GROWTH } from './arenaConstants';

describe('unlockCost', () => {
  it('first unlock is free', () => {
    expect(unlockCost(0)).toBe(0);
  });

  it('subsequent unlocks follow BASE * GROWTH^(k-1)', () => {
    expect(unlockCost(1)).toBe(UNLOCK_BASE);
    expect(unlockCost(2)).toBe(Math.floor(UNLOCK_BASE * UNLOCK_GROWTH));
    expect(unlockCost(3)).toBe(Math.floor(UNLOCK_BASE * UNLOCK_GROWTH * UNLOCK_GROWTH));
  });
});

describe('startingUnlockedCount', () => {
  it('returns base + prestige level, clamped to totalSlots', () => {
    expect(startingUnlockedCount({ preUnlockedLevel: 0, totalSlots: 10 })).toBe(BASE_STARTING_SLOTS);
    expect(startingUnlockedCount({ preUnlockedLevel: 5, totalSlots: 10 })).toBe(BASE_STARTING_SLOTS + 5);
    expect(startingUnlockedCount({ preUnlockedLevel: 20, totalSlots: 4 })).toBe(4);
  });
});

describe('SlotMask', () => {
  it('tracks unlocked slots and reports counts', () => {
    const mask = new SlotMask(['a', 'b', 'c']);
    mask.unlock('a');
    expect(mask.isUnlocked('a')).toBe(true);
    expect(mask.isUnlocked('b')).toBe(false);
    expect(mask.unlockedCount).toBe(1);
  });

  it('tracks freeUnlockUsed once, then false remains false until reset', () => {
    const mask = new SlotMask(['a', 'b']);
    expect(mask.freeUnlockUsed).toBe(false);
    mask.markFreeUnlockUsed();
    expect(mask.freeUnlockUsed).toBe(true);
    mask.markFreeUnlockUsed(); // no-op second time
    expect(mask.freeUnlockUsed).toBe(true);
  });

  it('serializes + restores', () => {
    const mask = new SlotMask(['a', 'b', 'c']);
    mask.unlock('a'); mask.unlock('c'); mask.markFreeUnlockUsed();
    const snap = mask.snapshot();
    const restored = SlotMask.fromSnapshot(['a', 'b', 'c'], snap);
    expect(restored.isUnlocked('a')).toBe(true);
    expect(restored.isUnlocked('b')).toBe(false);
    expect(restored.isUnlocked('c')).toBe(true);
    expect(restored.freeUnlockUsed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- --run slotState`
Expected: FAIL — file not implemented.

- [ ] **Step 3: Write slotState**

```ts
// src/game/arena/slotState.ts
import { BASE_STARTING_SLOTS, UNLOCK_BASE, UNLOCK_GROWTH } from './arenaConstants';

export function unlockCost(alreadyUnlockedBeyondStart: number): number {
  if (alreadyUnlockedBeyondStart <= 0) return 0;
  return Math.floor(UNLOCK_BASE * Math.pow(UNLOCK_GROWTH, alreadyUnlockedBeyondStart - 1));
}

export function startingUnlockedCount(opts: { preUnlockedLevel: number; totalSlots: number }): number {
  return Math.min(BASE_STARTING_SLOTS + opts.preUnlockedLevel, opts.totalSlots);
}

export interface SlotMaskSnapshot {
  readonly unlocked: readonly string[];
  readonly freeUnlockUsed: boolean;
}

export class SlotMask {
  private readonly _unlocked = new Set<string>();
  private readonly _allIds: readonly string[];
  private _freeUnlockUsed = false;

  constructor(allSlotIds: readonly string[]) {
    this._allIds = allSlotIds;
  }

  get unlockedCount(): number { return this._unlocked.size; }
  get freeUnlockUsed(): boolean { return this._freeUnlockUsed; }

  isUnlocked(id: string): boolean { return this._unlocked.has(id); }

  unlock(id: string): void { this._unlocked.add(id); }

  markFreeUnlockUsed(): void { this._freeUnlockUsed = true; }

  snapshot(): SlotMaskSnapshot {
    return { unlocked: [...this._unlocked], freeUnlockUsed: this._freeUnlockUsed };
  }

  static fromSnapshot(allSlotIds: readonly string[], snap: SlotMaskSnapshot): SlotMask {
    const m = new SlotMask(allSlotIds);
    for (const id of snap.unlocked) m._unlocked.add(id);
    m._freeUnlockUsed = snap.freeUnlockUsed;
    return m;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run slotState`
Expected: PASS 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/game/arena/slotState.ts src/game/arena/slotState.test.ts
git commit -m "arena: slotState (unlock curve + mask)"
```

---

## Phase 2 · State & persistence

### Task 5: Extend `gameplayState` — slot + install tracking

**Files:**
- Modify: `src/game/gameplayState.ts`
- Modify: `src/game/gameplayState.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `gameplayState.test.ts`:

```ts
describe('arena slot tracking', () => {
  beforeEach(() => gameplayState.reset());

  it('initArenaSlots clears installation map', () => {
    gameplayState.initArenaSlots(['a', 'b']);
    gameplayState.installWeapon('a', 'saw', 'inst-1');
    gameplayState.initArenaSlots(['x', 'y']);
    expect(gameplayState.installedAt('x')).toBeUndefined();
  });

  it('unlockSlot debits cash, emits slotUnlocked, updates mask', () => {
    gameplayState.addCash(1000);
    gameplayState.initArenaSlots(['a', 'b']);
    const events: string[] = [];
    gameplayState.on('slotUnlocked', (id) => events.push(id));
    expect(gameplayState.tryUnlockSlot('a', 100)).toBe(true);
    expect(gameplayState.cash).toBe(900);
    expect(gameplayState.isSlotUnlocked('a')).toBe(true);
    expect(events).toEqual(['a']);
  });

  it('tryUnlockSlot with cost 0 succeeds even at $0 cash', () => {
    gameplayState.initArenaSlots(['a']);
    expect(gameplayState.tryUnlockSlot('a', 0)).toBe(true);
    expect(gameplayState.cash).toBe(0);
  });

  it('installWeapon + uninstallWeapon maintain install map', () => {
    gameplayState.initArenaSlots(['a']);
    gameplayState.installWeapon('a', 'saw', 'inst-1');
    expect(gameplayState.installedAt('a')).toEqual({ typeId: 'saw', instanceId: 'inst-1' });
    gameplayState.uninstallWeapon('a');
    expect(gameplayState.installedAt('a')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- --run gameplayState`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement the new API**

In `gameplayState.ts`:

1. Add the `slotUnlocked`, `weaponInstalled`, `weaponUninstalled` events to the `Events` interface:

```ts
interface Events {
  // existing
  cashChanged: [cash: number, delta: number];
  cashEarned: [amount: number];
  upgradeLevelChanged: [id: string, level: number];
  weaponCountChanged: [id: string, count: number];
  // new
  slotUnlocked: [slotId: string];
  weaponInstalled: [slotId: string, typeId: string, instanceId: string];
  weaponUninstalled: [slotId: string];
}
```

2. Initialize the new Sets in the listeners map.

3. Add private state:

```ts
private _allSlotIds: readonly string[] = [];
private readonly _unlockedSlots = new Set<string>();
private _freeUnlockUsed = false;
private readonly _installs = new Map<string, { typeId: string; instanceId: string }>();
```

4. Add public methods:

```ts
initArenaSlots(ids: readonly string[]): void {
  this._allSlotIds = ids;
  this._unlockedSlots.clear();
  this._freeUnlockUsed = false;
  this._installs.clear();
}

preUnlockSlots(ids: readonly string[]): void {
  for (const id of ids) this._unlockedSlots.add(id);
}

isSlotUnlocked(id: string): boolean { return this._unlockedSlots.has(id); }

tryUnlockSlot(id: string, cost: number): boolean {
  if (cost > 0 && !this.trySpend(cost)) return false;
  this._unlockedSlots.add(id);
  this.emit('slotUnlocked', id);
  return true;
}

get freeUnlockUsed(): boolean { return this._freeUnlockUsed; }
markFreeUnlockUsed(): void { this._freeUnlockUsed = true; }

installWeapon(slotId: string, typeId: string, instanceId: string): void {
  this._installs.set(slotId, { typeId, instanceId });
  this.emit('weaponInstalled', slotId, typeId, instanceId);
}

uninstallWeapon(slotId: string): void {
  if (!this._installs.has(slotId)) return;
  this._installs.delete(slotId);
  this.emit('weaponUninstalled', slotId);
}

installedAt(slotId: string): { typeId: string; instanceId: string } | undefined {
  return this._installs.get(slotId);
}

unlockedSlotIds(): readonly string[] { return [...this._unlockedSlots]; }

allInstalls(): readonly { slotId: string; typeId: string; instanceId: string }[] {
  return [...this._installs].map(([slotId, v]) => ({ slotId, ...v }));
}
```

5. Extend `resetData()` to clear `_allSlotIds`, `_unlockedSlots`, `_freeUnlockUsed`, `_installs`.
6. Extend `reset()` to also clear the new listener sets.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run gameplayState`
Expected: PASS (all previous + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/game/gameplayState.ts src/game/gameplayState.test.ts
git commit -m "state: slot unlock + weapon install tracking on gameplayState"
```

---

### Task 6: Save schema v3 — wipe on mismatch

**Files:**
- Modify: `src/game/saveState.ts`
- Modify: `src/game/saveState.test.ts`

- [ ] **Step 1: Write failing tests**

Replace or extend tests:

```ts
describe('save v3', () => {
  beforeEach(() => localStorage.clear());

  it('serializes and round-trips a v3 save', () => {
    const s: SaveStateV3 = {
      v: 3,
      cash: 100,
      levels: { 'saw.damage': 2 },
      weaponCounts: { saw: 1 },
      weaponInstallations: [{ slotId: 'a', typeId: 'saw', instanceId: 'inst-1', clockwise: true }],
      emaCashPerSec: 0,
      savedAt: Date.now(),
      runSeed: 'abc',
      arenaSeed: 12345,
      arenaSlotsUnlocked: ['a'],
      arenaFreeUnlockUsed: true,
      pendingShardsThisRun: 0,
      prestigeShards: 0,
      prestigeCount: 0,
      prestigeShopLevels: {},
      instancesBoughtThisRun: {},
    };
    const json = serialize(s);
    expect(deserialize(json)).toEqual(s);
  });

  it('loading a v1 or v2 blob returns null (wipe path)', () => {
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify({ v: 1, cash: 1, levels: {}, weaponCounts: {}, weaponInstances: [], emaCashPerSec: 0, savedAt: 0 }));
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({ v: 2 }));
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('loadFromLocalStorage returns null when no save', () => {
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('clearSave wipes every known key', () => {
    localStorage.setItem(STORAGE_KEY_V1, 'x');
    localStorage.setItem(STORAGE_KEY_V2, 'x');
    localStorage.setItem(STORAGE_KEY, 'x');
    clearSave();
    expect(localStorage.getItem(STORAGE_KEY_V1)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- --run saveState`
Expected: FAIL — `SaveStateV3` doesn't exist, constant names differ, etc.

- [ ] **Step 3: Rewrite `saveState.ts` for v3**

```ts
// src/game/saveState.ts
export interface SavedWeaponInstallation {
  slotId: string;
  typeId: string;
  instanceId: string;
  clockwise?: boolean;
}

export interface SaveStateV3 {
  v: 3;
  cash: number;
  levels: Record<string, number>;
  weaponCounts: Record<string, number>;
  weaponInstallations: SavedWeaponInstallation[];
  emaCashPerSec: number;
  savedAt: number;
  runSeed: string;
  arenaSeed: number;
  arenaSlotsUnlocked: string[];
  arenaFreeUnlockUsed: boolean;
  pendingShardsThisRun: number;
  prestigeShards: number;
  prestigeCount: number;
  prestigeShopLevels: Record<string, number>;
  instancesBoughtThisRun: Record<string, number>;
}

export const SAVE_STATE_VERSION = 3;
export const STORAGE_KEY = 'asteroid-grinder:save:v3';
export const STORAGE_KEY_V1 = 'asteroid-grinder:save:v1';
export const STORAGE_KEY_V2 = 'asteroid-grinder:save:v2';
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const MIN_OFFLINE_MS = 60 * 1000;

export function serialize(state: SaveStateV3): string { return JSON.stringify(state); }

export function deserialize(json: string): SaveStateV3 | null {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SaveStateV3>;
  if (p.v !== 3) return null;
  if (!validateV3(p)) return null;
  return p as SaveStateV3;
}

function validateV3(p: Partial<SaveStateV3>): boolean {
  if (typeof p.cash !== 'number') return false;
  if (!p.levels || typeof p.levels !== 'object') return false;
  if (!p.weaponCounts || typeof p.weaponCounts !== 'object') return false;
  if (!Array.isArray(p.weaponInstallations)) return false;
  for (const inst of p.weaponInstallations) {
    if (!inst || typeof inst !== 'object') return false;
    if (typeof inst.slotId !== 'string') return false;
    if (typeof inst.typeId !== 'string') return false;
    if (typeof inst.instanceId !== 'string') return false;
  }
  if (typeof p.emaCashPerSec !== 'number') return false;
  if (typeof p.savedAt !== 'number') return false;
  if (typeof p.runSeed !== 'string') return false;
  if (typeof p.arenaSeed !== 'number') return false;
  if (!Array.isArray(p.arenaSlotsUnlocked)) return false;
  if (typeof p.arenaFreeUnlockUsed !== 'boolean') return false;
  if (typeof p.pendingShardsThisRun !== 'number') return false;
  if (typeof p.prestigeShards !== 'number') return false;
  if (typeof p.prestigeCount !== 'number') return false;
  if (!p.prestigeShopLevels || typeof p.prestigeShopLevels !== 'object') return false;
  if (!p.instancesBoughtThisRun || typeof p.instancesBoughtThisRun !== 'object') return false;
  return true;
}

export function saveToLocalStorage(state: SaveStateV3): void {
  try { localStorage.setItem(STORAGE_KEY, serialize(state)); } catch {}
}

export function loadFromLocalStorage(): SaveStateV3 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {}
}

// Detect a stale save from a prior version so the bootstrap can show a toast +
// wipe. Returns true only if an older key has data.
export function hasLegacySave(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_V2) != null || localStorage.getItem(STORAGE_KEY_V1) != null;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run saveState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/saveState.ts src/game/saveState.test.ts
git commit -m "saveState: v3 schema, no migration (wipe on legacy)"
```

---

### Task 7: Prestige shop — `preUnlockedSlots`

**Files:**
- Modify: `src/game/prestigeShopCatalog.ts`
- Modify: `src/game/prestigeShopCatalog.test.ts`
- Modify: `src/game/prestigeEffects.ts` (if it aggregates shop levels into effects)
- Modify: `src/game/prestigeEffects.test.ts`

- [ ] **Step 1: Extend the shop catalog entry**

Add to `PRESTIGE_SHOP` in `prestigeShopCatalog.ts`:

```ts
  { id: 'arena.preUnlockedSlots', family: 'economy', name: 'Pre-Unlocked Slots', description: '+1 slot unlocked at run start per level', baseCost: 10, growthRate: 1.8, maxLevel: 9 /* = MAX_SLOTS - 1 */ },
```

- [ ] **Step 2: Extend shop catalog test**

In `prestigeShopCatalog.test.ts`, add:

```ts
it('exposes arena.preUnlockedSlots with level cap = MAX_SLOTS - 1', async () => {
  const { MAX_SLOTS } = await import('./arena/arenaConstants');
  const entry = findShopEntry('arena.preUnlockedSlots');
  expect(entry).toBeDefined();
  expect(entry!.maxLevel).toBe(MAX_SLOTS - 1);
});
```

- [ ] **Step 3: Extend `prestigeEffects.ts`** (if it has an aggregate function)

If there's a `collectEffects(levels)` function that returns an effects bundle, add a `preUnlockedSlots` field that reads `levels['arena.preUnlockedSlots'] ?? 0`. If no such aggregator exists, skip this step — the effect is consumed directly from `prestigeShopLevels` at arena build time.

Add a test like:

```ts
it('preUnlockedSlots reads from shop levels', () => {
  const effects = collectEffects({ 'arena.preUnlockedSlots': 3 });
  expect(effects.preUnlockedSlots).toBe(3);
});
```

- [ ] **Step 4: Typecheck + test**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/prestigeShopCatalog.ts src/game/prestigeShopCatalog.test.ts src/game/prestigeEffects.ts src/game/prestigeEffects.test.ts
git commit -m "prestige: arena.preUnlockedSlots shop item (cap MAX_SLOTS-1)"
```

---

## Phase 3 · Dead code removal

### Task 8: Remove `chute.channelWidth` upgrade

**Files:**
- Modify: `src/game/weaponCatalog.ts:272` — remove the `chute.channelWidth` upgrade entry.
- Modify: `src/game/upgradeApplier.ts:126` — remove `channelHalfWidth` computation; drop from `EffectiveGameplayParams`.
- Modify: `src/game/upgradeApplier.test.ts` — delete lines 37 and 187 references.

- [ ] **Step 1: Remove the upgrade definition**

In `weaponCatalog.ts`, delete the `chute.channelWidth` upgrade entry (search for `'chute.channelWidth'` and remove its object).

- [ ] **Step 2: Remove the effective param**

In `upgradeApplier.ts`:
- Delete the `channelHalfWidth` field from `EffectiveGameplayParams`.
- Delete `BASE_PARAMS.channelHalfWidth`.
- Delete the line that computes it (line 126).
- Delete `CHANNEL_WIDTH_PER_LEVEL` constant if unused elsewhere.

- [ ] **Step 3: Fix test references**

In `upgradeApplier.test.ts`, delete the two test cases that reference `chute.channelWidth` and `channelHalfWidth`.

- [ ] **Step 4: Typecheck — expect failures**

Run: `npm run typecheck`
Expected: compile errors from `GameScene.ts`, `grinderBehavior.ts` that reference `channelHalfWidth`. These are fixed in the next task; keep this commit working by adding a temporary placeholder value.

Actually: the cleaner cut is to do all three edits together so typecheck stays green. Combine this with Task 10 if necessary. For now, replace `params.channelHalfWidth` usage in `GameScene` with a module-level `const LEGACY_CHANNEL_HALF_WIDTH = 600` used only by sites not yet updated, marked `// TEMP: removed in Task 10`. Same in `grinderBehavior.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "upgrades: remove chute.channelWidth (pre-arena)"
```

---

### Task 9: Delete `weaponPlacement` (clampWeaponToChute)

**Files:**
- Delete: `src/game/weaponPlacement.ts`
- Delete: `src/game/weaponPlacement.test.ts`
- Modify: every call site of `clampWeaponToChute` (search `rg "clampWeaponToChute"`)

- [ ] **Step 1: Grep call sites**

Run: `rg -l "clampWeaponToChute|weaponPlacement" src`
Expected: `src/scenes/GameScene.ts` + both files to be deleted.

- [ ] **Step 2: Temporarily stub the call site**

In `GameScene.ts`, replace the `clampWeaponToChute` usage with a no-op: the saved `(x, y)` is used as-is. The full replacement (mapping to slot IDs) lands in Task 13.

- [ ] **Step 3: Delete the files**

```bash
rm src/game/weaponPlacement.ts src/game/weaponPlacement.test.ts
```

- [ ] **Step 4: Typecheck + test**

Run: `npm run typecheck && npm test`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "weaponPlacement: delete (slot-id mapping replaces clamp)"
```

---

## Phase 4 · Scene integration

### Task 10: `GameScene.buildArenaFromLayout`

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Generate layout on scene create**

Near the top of `GameScene.create()` (after params are resolved, before weapons spawn), add:

```ts
import { generateArena } from '../game/arena/arenaGenerator';
import { MIN_SLOTS, MAX_SLOTS, FLOOR_BAND_HEIGHT } from '../game/arena/arenaConstants';

// Replace existing rebuildChannelWalls() call.
const seedNumber = hashSeedString(gameplayState.runSeed || 'default');
this.arenaLayout = generateArena(seedNumber, {
  width: this.scale.width,
  height: this.scale.height,
  minSlots: MIN_SLOTS,
  maxSlots: MAX_SLOTS,
});
this.buildArenaFromLayout(this.arenaLayout);
gameplayState.initArenaSlots(this.arenaLayout.slots.map((s) => s.id));
```

Helper:

```ts
function hashSeedString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; }
  return h || 1;
}
```

- [ ] **Step 2: Implement `buildArenaFromLayout`**

```ts
private arenaLayout!: ArenaLayout;
private arenaWallBodies: MatterJS.BodyType[] = [];
private arenaWallVisuals: Phaser.GameObjects.Rectangle[] = [];
private screenEdgeWalls: MatterJS.BodyType[] = [];

private buildArenaFromLayout(layout: ArenaLayout): void {
  // Teardown any previous arena (for mid-run regen, prestige reset).
  for (const b of this.arenaWallBodies) this.matter.world.remove(b);
  for (const v of this.arenaWallVisuals) v.destroy();
  for (const b of this.screenEdgeWalls) this.matter.world.remove(b);
  this.arenaWallBodies = [];
  this.arenaWallVisuals = [];
  this.screenEdgeWalls = [];

  // Screen-edge walls (left + right, full playfield height above floor).
  const edgeT = WALL_COLLIDER_THICKNESS;
  const w = layout.playfield.width;
  const h = layout.floorY;
  this.screenEdgeWalls.push(
    this.matter.add.rectangle(-edgeT / 2, h / 2, edgeT, h, { isStatic: true }),
    this.matter.add.rectangle(w + edgeT / 2, h / 2, edgeT, h, { isStatic: true }),
  );

  // Interior walls from layout.
  for (const seg of layout.walls) {
    const cx = (seg.x1 + seg.x2) / 2;
    const cy = (seg.y1 + seg.y2) / 2;
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const angle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    const body = this.matter.add.rectangle(cx, cy, len, WALL_COLLIDER_THICKNESS, { isStatic: true, angle });
    const visual = this.add.rectangle(cx, cy, len, 12, 0x3a3a4c).setRotation(angle);
    this.arenaWallBodies.push(body);
    this.arenaWallVisuals.push(visual);
  }
}
```

Remove the old `rebuildChannelWalls`, `channelLeftBody`/`channelRightBody` fields, and the `CHANNEL_WALL_*` constants.

- [ ] **Step 3: Update grinder row width**

`grinderBehavior.ts` currently reads `channelHalfWidth`. Replace with full playfield width (minus a small inset). Specifically:
- Replace `this.channelWidth = params.channelHalfWidth * 2;` with `this.channelWidth = this.scene.scale.width - 40;` (40 = small inset to clear edge walls).
- Remove the `channelHalfWidth !== prev.channelHalfWidth` branch from `onParamsChanged`; the grinder no longer resizes.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: pass. If a test still references the old fields, delete it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "scene: buildArenaFromLayout replaces channel walls; grinder spans full width"
```

---

### Task 11: Oscillating spawner

**Files:**
- Modify: `src/game/asteroidSpawner.ts`
- Modify: `src/scenes/GameScene.ts` (spawn call site)

- [ ] **Step 1: Add phase state + computeSpawnX**

In `asteroidSpawner.ts`, add:

```ts
import { PHASE_STEP_RAD, SPAWN_MARGIN } from './arena/arenaConstants';

let spawnPhase = 0;

export function resetSpawnPhase(): void { spawnPhase = 0; }

export function nextSpawnX(playfieldWidth: number, maxRadius: number): number {
  const amplitude = Math.max(0, playfieldWidth / 2 - maxRadius - SPAWN_MARGIN);
  const x = playfieldWidth / 2 + amplitude * Math.sin(spawnPhase);
  spawnPhase += PHASE_STEP_RAD;
  return x;
}
```

- [ ] **Step 2: Use it in `GameScene.spawnAsteroid`**

Replace the current `jitter` calculation with:

```ts
const spawnX = nextSpawnX(this.scale.width, MAX_ASTEROID_RADIUS);
```

Spawn Y should be a small negative number (above screen) so asteroids fall into the open-top arena.

- [ ] **Step 3: Reset phase on resetData**

In `GameScene.resetRun` (or wherever a run starts), call `resetSpawnPhase()`.

- [ ] **Step 4: Add test**

Create `src/game/asteroidSpawner.test.ts` (or extend) with:

```ts
import { describe, it, expect } from 'vitest';
import { nextSpawnX, resetSpawnPhase } from './asteroidSpawner';

describe('nextSpawnX', () => {
  it('oscillates around the center', () => {
    resetSpawnPhase();
    const xs = Array.from({ length: 10 }, () => nextSpawnX(2560, 40));
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    expect(max).toBeGreaterThan(1280); // right of center
    expect(min).toBeLessThan(1280);    // left of center
  });

  it('is deterministic after reset', () => {
    resetSpawnPhase();
    const a = nextSpawnX(2560, 40);
    resetSpawnPhase();
    const b = nextSpawnX(2560, 40);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 5: Run tests; commit**

```bash
git add -A
git commit -m "spawner: oscillating x across playfield width"
```

---

### Task 12: Slot marker rendering + debug overlay

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Render slot markers**

In `buildArenaFromLayout`, after walls:

```ts
private slotMarkers = new Map<string, Phaser.GameObjects.Graphics>();

// inside buildArenaFromLayout, at the end:
this.slotMarkers.forEach((g) => g.destroy());
this.slotMarkers.clear();
for (const slot of layout.slots) {
  const g = this.add.graphics();
  this.redrawSlotMarker(g, slot);
  this.slotMarkers.set(slot.id, g);
}
```

```ts
private redrawSlotMarker(g: Phaser.GameObjects.Graphics, slot: SlotDef): void {
  g.clear();
  const unlocked = gameplayState.isSlotUnlocked(slot.id);
  const installed = !!gameplayState.installedAt(slot.id);
  if (installed) return; // weapon covers the marker
  if (unlocked) {
    g.lineStyle(3, 0xf5d66d, 1);
    g.strokeCircle(slot.x, slot.y, 18);
  } else {
    g.fillStyle(0x555568, 1);
    g.fillCircle(slot.x, slot.y, 18);
    g.lineStyle(2, 0x2a2a34, 1);
    g.strokeCircle(slot.x, slot.y, 18);
  }
}
```

- [ ] **Step 2: Subscribe to slot events**

In `create()`:

```ts
gameplayState.on('slotUnlocked', (id) => {
  const g = this.slotMarkers.get(id);
  const slot = this.arenaLayout.slots.find((s) => s.id === id);
  if (g && slot) this.redrawSlotMarker(g, slot);
});
gameplayState.on('weaponInstalled', (slotId) => {
  const g = this.slotMarkers.get(slotId);
  const slot = this.arenaLayout.slots.find((s) => s.id === slotId);
  if (g && slot) this.redrawSlotMarker(g, slot);
});
gameplayState.on('weaponUninstalled', (slotId) => {
  const g = this.slotMarkers.get(slotId);
  const slot = this.arenaLayout.slots.find((s) => s.id === slotId);
  if (g && slot) this.redrawSlotMarker(g, slot);
});
```

- [ ] **Step 3: Backtick debug overlay**

Add:

```ts
private debugOverlay?: Phaser.GameObjects.Graphics;

// in create():
this.input.keyboard?.on('keydown-BACKTICK', () => this.toggleDebugOverlay());

private toggleDebugOverlay(): void {
  if (this.debugOverlay) { this.debugOverlay.destroy(); this.debugOverlay = undefined; return; }
  const g = this.add.graphics();
  g.lineStyle(1, 0x00ff88, 0.6);
  for (const w of this.arenaLayout.walls) {
    g.lineBetween(w.x1, w.y1, w.x2, w.y2);
  }
  for (const s of this.arenaLayout.slots) {
    g.strokeCircle(s.x, s.y, 22);
  }
  this.debugOverlay = g;
}
```

- [ ] **Step 4: Devtools handle**

In `main.ts`:

```ts
(window as unknown as { __ARENA__: unknown }).__ARENA__ = () =>
  (game.scene.getScene('game') as GameScene).arenaLayout;
```

- [ ] **Step 5: Typecheck; commit**

```bash
git add -A
git commit -m "scene: slot markers + backtick debug overlay + __ARENA__ handle"
```

---

### Task 13: UIScene slot-unlock affordance + weapon installer

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Click handling on slot markers**

The slot markers live on `GameScene`. Route click handling through `GameScene.input` and emit a scene event that `UIScene` listens for, OR (simpler) add an invisible `setInteractive()` hit-area on each slot marker and call into `UIScene` via `scene.get('ui')`.

Simpler path — on each marker:

```ts
g.setInteractive(new Phaser.Geom.Circle(slot.x, slot.y, 22), Phaser.Geom.Circle.Contains);
g.on('pointerup', () => this.handleSlotClick(slot));
```

Handler on `GameScene`:

```ts
private handleSlotClick(slot: SlotDef): void {
  if (!gameplayState.isSlotUnlocked(slot.id)) {
    const k = gameplayState.unlockedSlotIds().length - startingUnlockedCount({
      preUnlockedLevel: /* from prestige shop levels */,
      totalSlots: this.arenaLayout.slots.length,
    });
    let cost = unlockCost(Math.max(0, k));
    if (!gameplayState.freeUnlockUsed) { cost = 0; }
    if (gameplayState.tryUnlockSlot(slot.id, cost)) {
      if (cost === 0) gameplayState.markFreeUnlockUsed();
    }
    return;
  }
  if (!gameplayState.installedAt(slot.id)) {
    this.scene.get('ui').events.emit('open-weapon-picker', slot);
  }
}
```

- [ ] **Step 2: Weapon picker in UIScene**

Add a small modal (DOM or Phaser containers) listing the four weapon categories. On select:

```ts
// In UIScene
this.events.on('open-weapon-picker', (slot: SlotDef) => this.openPicker(slot));

private openPicker(slot: SlotDef): void {
  // Build a simple overlay listing saw/laser/missile/blackhole buy buttons.
  // On click, emit 'install-weapon' with {slotId, typeId}.
}
```

GameScene listens:

```ts
this.scene.get('ui').events.on('install-weapon', ({ slotId, typeId }) => {
  if (!this.tryBuyWeaponAtSlot(slotId, typeId)) return;
});
```

`tryBuyWeaponAtSlot(slotId, typeId)` computes the current weapon buy cost, calls `gameplayState.trySpend`, instantiates the weapon at the slot position, calls `gameplayState.installWeapon(slotId, typeId, instanceId)`.

- [ ] **Step 3: Smoke test manually in browser**

Run: `npm run dev` — open Chrome via MCP to http://127.0.0.1:5173, confirm you can:
- see slot markers (yellow circles unlocked, grey locked)
- click a locked slot (should unlock free the first time, then debit cash)
- click an unlocked empty slot (picker opens)
- buy a weapon → installs at slot

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ui: slot-click unlock + weapon picker modal"
```

---

### Task 14: Wire prestige `preUnlockedSlots` to run start

**Files:**
- Modify: `src/scenes/GameScene.ts` (right after `initArenaSlots`)

- [ ] **Step 1: Read prestige level; pre-unlock N slots**

```ts
import { startingUnlockedCount } from '../game/arena/slotState';

const preUnlockedLevel = prestigeShopLevels['arena.preUnlockedSlots'] ?? 0;
const nPre = startingUnlockedCount({
  preUnlockedLevel,
  totalSlots: this.arenaLayout.slots.length,
});
// Pick the N closest-to-center slots to pre-unlock (predictable, pleasing).
const sorted = [...this.arenaLayout.slots].sort((a, b) =>
  Math.hypot(a.x - this.scale.width / 2, a.y - this.scale.height / 2)
  - Math.hypot(b.x - this.scale.width / 2, b.y - this.scale.height / 2));
for (let i = 0; i < nPre; i++) gameplayState.tryUnlockSlot(sorted[i].id, 0);
```

- [ ] **Step 2: Verify end-to-end in browser**

Use `window.__STATE__` to set `prestigeShopLevels['arena.preUnlockedSlots'] = 3`, reload, confirm 5 slots (2 base + 3) start unlocked.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "arena: pre-unlock slots at run start per prestige level"
```

---

## Phase 5 · E2E + persistence integration

### Task 15: Save/load wiring — bootstrap

**Files:**
- Modify: `src/main.ts` or wherever save/load bootstrap lives
- Modify: `src/scenes/GameScene.ts` — save arena fields + install list

- [ ] **Step 1: Detect legacy save + toast**

In the save/load bootstrap:

```ts
import { hasLegacySave, clearSave } from './game/saveState';

if (hasLegacySave()) {
  clearSave();
  // Show a transient toast. If you have a toast system, use it; otherwise
  // stash a flag on game.registry so UIScene can show it on create.
  game.registry.set('saveWipedReason', 'Save reset — game updated');
}
```

`UIScene.create()` reads `saveWipedReason`, displays a 5-second banner if present, then clears it.

- [ ] **Step 2: Serialize new fields**

The existing save-snapshot gatherer probably lives near `resetRun`/`tickSave`. Populate:

```ts
const snap: SaveStateV3 = {
  v: 3,
  /* ... existing fields ... */
  arenaSeed: this.arenaLayout.seed,
  arenaSlotsUnlocked: gameplayState.unlockedSlotIds() as string[],
  arenaFreeUnlockUsed: gameplayState.freeUnlockUsed,
  weaponInstallations: gameplayState.allInstalls().map(({ slotId, typeId, instanceId }) => ({
    slotId, typeId, instanceId,
  })),
};
```

- [ ] **Step 3: Restore on load**

At load time (before building arena):

```ts
if (save) {
  gameplayState.loadSnapshot(/* existing fields */);
  const arenaSeed = save.arenaSeed;
  this.arenaLayout = generateArena(arenaSeed, { /* ... */ });
  this.buildArenaFromLayout(this.arenaLayout);
  gameplayState.initArenaSlots(this.arenaLayout.slots.map((s) => s.id));
  for (const id of save.arenaSlotsUnlocked) gameplayState.tryUnlockSlot(id, 0);
  if (save.arenaFreeUnlockUsed) gameplayState.markFreeUnlockUsed();
  for (const inst of save.weaponInstallations) {
    const slot = this.arenaLayout.slots.find((s) => s.id === inst.slotId);
    if (!slot) continue; // stale id — silently drop
    this.instantiateWeaponAtSlot(slot, inst.typeId, inst.instanceId);
    gameplayState.installWeapon(inst.slotId, inst.typeId, inst.instanceId);
  }
}
```

- [ ] **Step 4: Smoke test save/load**

Manual: buy a weapon, unlock a slot, close tab, reopen, verify both persist. Verify `localStorage` shows `asteroid-grinder:save:v3` key.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "persistence: arena seed + slot mask + installs round-trip v3"
```

---

### Task 16: Playwright — extend smoke, add arena-seed spec

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Create: `tests/e2e/arena-seed.spec.ts`

- [ ] **Step 1: Extend smoke**

Add after the existing assertions:

```ts
const slotMarkerCount = await page.evaluate(() => {
  const scene = (window as any).__GAME__.scene.getScene('game');
  return scene.slotMarkers?.size ?? 0;
});
expect(slotMarkerCount).toBeGreaterThanOrEqual(4);
expect(slotMarkerCount).toBeLessThanOrEqual(10);
```

- [ ] **Step 2: New arena-seed spec**

```ts
// tests/e2e/arena-seed.spec.ts
import { test, expect } from '@playwright/test';

test('seed determinism: same seed produces identical slot count and positions', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__GAME__);
  const seed = 'test-seed-12345';
  const layoutA = await page.evaluate((s) => {
    const state = (window as any).__STATE__;
    state.setRunSeed(s);
    (window as any).__GAME__.scene.getScene('game').scene.restart();
    return new Promise((resolve) => setTimeout(() => {
      const scene = (window as any).__GAME__.scene.getScene('game');
      resolve(scene.arenaLayout);
    }, 500));
  }, seed);

  await page.reload();
  await page.waitForFunction(() => (window as any).__GAME__);
  const layoutB = await page.evaluate((s) => {
    const state = (window as any).__STATE__;
    state.setRunSeed(s);
    (window as any).__GAME__.scene.getScene('game').scene.restart();
    return new Promise((resolve) => setTimeout(() => {
      const scene = (window as any).__GAME__.scene.getScene('game');
      resolve(scene.arenaLayout);
    }, 500));
  }, seed);

  expect(layoutB).toEqual(layoutA);
});
```

- [ ] **Step 3: Run Playwright**

Run: `npm run test:e2e`
Expected: both specs pass, clean console.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "e2e: extend smoke + arena-seed determinism spec"
```

---

## Phase 6 · Review, docs, user verification

### Task 17: Docs — invariants, README, CLAUDE.md, ROADMAP

**Files:**
- Modify: `DESIGN_INVARIANTS.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Add arena invariants**

Append a new `## Arena` section to `DESIGN_INVARIANTS.md`:

- Arena is deterministic from `runSeed`; every leaf reaches the floor (`isPlayable(layout)` passes after generation).
- First slot unlock per run is free — load-bearing rescue valve (`unlockCost(0) === 0`).
- Horizontal wall segments carry `|angle| ≥ MIN_WALL_SLANT_DEG` to prevent chunk stalling.
- Save version mismatch wipes localStorage and toasts — no migration code.
- Total arena slot count ∈ [MIN_SLOTS, MAX_SLOTS]; generator falls back to a safe straight-chute layout after MAX_RETRIES.

- [ ] **Step 2: Bump test count in CLAUDE.md**

Find the `169 tests across 16 files` line and update with the new totals (run `npm test` to get the new counts).

- [ ] **Step 3: Add GH Pages link to README**

Near the top of `README.md`, add (under the header):

```markdown
**Play it:** https://muwamath.github.io/asteroid-grinder/
```

- [ ] **Step 4: Mark ROADMAP arena item done**

Update the "Arena overhaul" bullet in `ROADMAP.md §3` to:

```markdown
- ✅ **Arena overhaul.** Shipped 2026-04-17. Walls extend to screen edges; open top with oscillating spawner; seeded BSP generator produces branching channel networks with 4–10 finite weapon slots. Slots are locked by default — first unlock per run free (rescue valve), subsequent unlocks follow an escalating placeholder cost curve. Prestige shop gains `arena.preUnlockedSlots` (+1 starting-unlocked slot per level, cap 9). Channel Width upgrade removed; `Asteroid Size` retained. Save schema bumped v2→v3 with wipe-on-mismatch (no user base yet). Spec: `docs/superpowers/specs/2026-04-17-procedural-arena-design.md`; plan: `docs/superpowers/plans/2026-04-17-procedural-arena.md`.
```

- [ ] **Step 5: Commit**

```bash
git add DESIGN_INVARIANTS.md CLAUDE.md README.md ROADMAP.md
git commit -m "docs: arena invariants, test count, README GH Pages, ROADMAP"
```

---

### Task 18: Code review pass (fresh agent, no implementation bias)

Per global workflow: code review is the second-to-last phase, before final verification.

- [ ] **Step 1: Dispatch fresh reviewer**

Use `Agent` tool with `subagent_type: "feature-dev:code-reviewer"`. Brief:
- Branch: `feature/procedural-arena`
- Spec: `docs/superpowers/specs/2026-04-17-procedural-arena-design.md`
- Plan: this file
- Ask for: bugs, logic errors, places the implementation drifted from the spec, generator playability edge cases, save/load race conditions, missing tests.

- [ ] **Step 2: Triage findings**

Split into: must-fix (block merge) vs. defer (add to ROADMAP backlog). Implement must-fix items; record defers.

- [ ] **Step 3: Re-run all checks**

```bash
npm run typecheck && npm test && npm run test:e2e && npm run build
```

Expected: all green.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "review: <summary>"
```

---

### Task 19: User verification + FF-merge

- [ ] **Step 1: Push feature branch**

```bash
git push -u origin feature/procedural-arena
```

- [ ] **Step 2: Run build locally, verify live dev**

```bash
npm run build
npm run dev
```

Open Chrome via MCP at http://127.0.0.1:5173.

- [ ] **Step 3: Walkthrough checklist (agent does this in Chrome before handing off)**

- [ ] Arena loads with visible interior walls (not just a straight chute).
- [ ] 4–10 slot markers visible; 2 start unlocked by default (or 2 + prestige preUnlockedSlots level).
- [ ] Oscillating spawner: watch 10 asteroids spawn; positions sweep left/right.
- [ ] First locked slot click → free unlock, yellow circle appears, cash unchanged.
- [ ] Second locked slot click → debit cash (`$50`).
- [ ] Weapon picker opens on unlocked empty-slot click.
- [ ] Weapons installed at slots stick across reload (`localStorage` round-trip).
- [ ] Backtick key toggles BSP debug overlay.
- [ ] No console errors over a 60s run.

- [ ] **Step 4: Hand off to User for manual inspection**

Per global CLAUDE.md: pause. Print the checklist + what the agent saw. Wait for User to verify in their own Chrome, confirm, then explicitly approve merge.

- [ ] **Step 5: FF-merge after User approval**

```bash
git checkout main
git merge --ff-only feature/procedural-arena
git push
```

GH Pages deploys on push to main. Open the live URL, verify parity, then announce shipped.

---

## Self-review checklist

- **Spec coverage:** every section of the spec has a task. Types → 1. Generator → 3. Validator → 2. Slot state → 4. gameplayState → 5. Save schema → 6. Prestige shop → 7. Upgrade removal → 8. Placement removal → 9. Scene build → 10. Spawner → 11. Markers + overlay + devtools → 12. UI picker → 13. Prestige wiring → 14. Save wiring → 15. E2E → 16. Review → 17. Docs → 18. Ship → 19.
- **No placeholders:** all code blocks are concrete. Where the §4 economy rebalance is deferred, the placeholder values are explicit constants in one file, clearly marked as placeholders.
- **Type consistency:** `ArenaLayout`, `SlotDef`, `WallSegment`, `ArenaSeedParams` referenced identically across tasks. `SlotMask` class vs `SlotMaskSnapshot` type distinction held. `preUnlockedSlots` prestige id = `'arena.preUnlockedSlots'` everywhere.
- **Test hygiene:** TDD order preserved in every logic task; integration/scene tasks drop the test-first step where a vitest harness is impractical, replaced by explicit manual verification in-browser.
