import { SeededRng } from '../rng';
import { isPlayable } from './arenaValidate';
import {
  MAX_DEPTH,
  SPLIT_P_DECAY,
  MAX_WALL_SLANT_DEG,
  MIN_LEAF_DIM,
  SLOT_SPACING,
  MAX_RETRIES,
  FLOOR_BAND_HEIGHT,
  MIN_SLOT_FLOOR_CLEARANCE,
  MIN_SLOT_WALL_CLEARANCE,
  OBSTACLE_COUNT_MIN,
  OBSTACLE_COUNT_MAX,
  OBSTACLE_CIRCLE_R_MIN,
  OBSTACLE_CIRCLE_R_MAX,
  OBSTACLE_DIAMOND_HALF_MIN,
  OBSTACLE_DIAMOND_HALF_MAX,
} from './arenaConstants';
import type { ArenaLayout, ArenaObstacle, ArenaSeedParams, SlotDef, WallSegment } from './arenaTypes';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
}

export function generateArena(seed: number, params: ArenaSeedParams): ArenaLayout {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const layout = tryGenerate(seed + attempt, params);
    // Retry on both unplayable topology AND undershooting minSlots. The
    // top-up loop in placeSlots has a safety cap; if a pathologically
    // fragmented BSP makes every candidate point too close to existing
    // slots, we could silently return a layout with <minSlots slots.
    if (isPlayable(layout) && layout.slots.length >= params.minSlots) {
      return { ...layout, seed };
    }
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

  for (let i = 0; i < walls.length; i++) {
    walls[i] = clampToPlayfield(applySlant(walls[i], rng), params.width, floorY);
  }

  const slots = placeSlots(leaves, rng, params, floorY, walls);
  const obstacles = placeObstacles(leaves, walls, slots, rng, floorY);

  return {
    seed,
    walls,
    slots,
    obstacles,
    floorY,
    playfield: { width: params.width, height: params.height },
  };
}

function splitRect(
  r: Rect,
  depth: number,
  rng: SeededRng,
  leavesOut: Rect[],
  wallsOut: WallSegment[],
): void {
  const pSplit = Math.pow(SPLIT_P_DECAY, depth);
  const canSplit = depth < MAX_DEPTH && r.w > MIN_LEAF_DIM * 2 && r.h > MIN_LEAF_DIM * 2;
  if (!canSplit || rng.next() > pSplit) {
    leavesOut.push(r);
    return;
  }

  // Always horizontal — vertical walls removed 2026-04-19 (user said they
  // "made no sense"). Variety now comes from applySlant rotating each wall
  // uniformly in [-45°, +45°] after BSP produces the base horizontal segment.
  // Split Y sampled wider (30–70%) and wall span tightened (0.15–0.40 start,
  // 0.60–0.85 end) for "lots more, smaller walls" feel.
  const sy = r.y + r.h * (0.3 + rng.next() * 0.4);
  const partialStart = r.x + r.w * (0.15 + rng.next() * 0.25);
  const partialEnd = r.x + r.w * (0.60 + rng.next() * 0.25);
  wallsOut.push({ x1: partialStart, y1: sy, x2: partialEnd, y2: sy });
  const top: Rect = { x: r.x, y: r.y, w: r.w, h: sy - r.y, id: r.id + 'T' };
  const bot: Rect = { x: r.x, y: sy, w: r.w, h: r.y + r.h - sy, id: r.id + 'B' };
  splitRect(top, depth + 1, rng, leavesOut, wallsOut);
  splitRect(bot, depth + 1, rng, leavesOut, wallsOut);
}

/**
 * Rotate a (BSP-horizontal) wall segment around its midpoint by a uniform
 * random angle in [-MAX_WALL_SLANT_DEG, +MAX_WALL_SLANT_DEG]. Every wall
 * lands somewhere in `/` to `\` per user spec (2026-04-19 variety pass).
 */
function applySlant(w: WallSegment, rng: SeededRng): WallSegment {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const length = Math.hypot(dx, dy) || 1;
  const cx = (w.x1 + w.x2) / 2;
  const cy = (w.y1 + w.y2) / 2;
  const slantDeg = (rng.next() * 2 - 1) * MAX_WALL_SLANT_DEG;
  const rad = (slantDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const half = length / 2;
  return {
    x1: cx - ux * half,
    y1: cy - uy * half,
    x2: cx + ux * half,
    y2: cy + uy * half,
  };
}

// ensureSlant rotates around the midpoint, which can push endpoints outside
// the playfield bounds — especially for long near-horizontal walls. Clamp
// both endpoints to [0, width] × [0, floorY] so generated walls never escape
// the screen-edge walls (the collider would clip into them otherwise).
function clampToPlayfield(w: WallSegment, width: number, floorY: number): WallSegment {
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  return {
    x1: clamp(w.x1, 0, width),
    y1: clamp(w.y1, 0, floorY),
    x2: clamp(w.x2, 0, width),
    y2: clamp(w.y2, 0, floorY),
  };
}

function placeSlots(
  leaves: readonly Rect[],
  rng: SeededRng,
  params: ArenaSeedParams,
  floorY: number,
  walls: readonly WallSegment[],
): SlotDef[] {
  const slots: SlotDef[] = [];
  let next = 0;
  const maxSlotY = floorY - MIN_SLOT_FLOOR_CLEARANCE;
  const sorted = [...leaves].sort((a, b) => b.w * b.h - a.w * a.h);
  const tryPlace = (cx: number, cy: number, spacing: number): boolean => {
    if (tooCloseToExisting(cx, cy, slots, spacing)) return false;
    if (tooCloseToAnyWall(cx, cy, walls, MIN_SLOT_WALL_CLEARANCE)) return false;
    return true;
  };
  for (const leaf of sorted) {
    const count = 1 + rng.nextInt(2);
    for (let i = 0; i < count; i++) {
      if (slots.length >= params.maxSlots) break;
      // Up to 8 tries per slot candidate — lets us reject wall overlaps
      // while still guaranteeing placement in crowded leaves.
      for (let attempt = 0; attempt < 8; attempt++) {
        const cx = leaf.x + leaf.w * (0.25 + rng.next() * 0.5);
        const rawCy = leaf.y + leaf.h * (0.3 + rng.next() * 0.5);
        const cy = Math.min(rawCy, maxSlotY);
        if (!tryPlace(cx, cy, SLOT_SPACING)) continue;
        slots.push({
          id: `s${next++}`,
          x: cx,
          y: cy,
          normalAngleRad: rng.next() * Math.PI * 2,
          leafId: leaf.id,
        });
        break;
      }
    }
    if (slots.length >= params.maxSlots) break;
  }
  const topUpSpacing = SLOT_SPACING * 0.6;
  let leafIdx = 0;
  let safetyIter = 0;
  while (slots.length < params.minSlots && safetyIter < 1000) {
    safetyIter++;
    const leaf = sorted[leafIdx % sorted.length];
    leafIdx++;
    const cx = leaf.x + leaf.w * (0.3 + rng.next() * 0.4);
    const rawCy = leaf.y + leaf.h * (0.3 + rng.next() * 0.4);
    const cy = Math.min(rawCy, maxSlotY);
    if (!tryPlace(cx, cy, topUpSpacing)) continue;
    slots.push({
      id: `s${next++}`,
      x: cx,
      y: cy,
      normalAngleRad: rng.next() * Math.PI * 2,
      leafId: leaf.id,
    });
  }
  return slots;
}

/**
 * Place 2–4 medium blocking obstacles (circles + diamonds) in BSP leaves.
 * Chunks catch on these for the intended "mayhem" feel. Clearance rules:
 *  - ≥ obstacle_r + 30px from any wall center-line
 *  - ≥ obstacle_r + 80px from any slot (weapon needs firing room)
 *  - ≥ (r1 + r2 + 40) from other obstacles (both treated as bounding circles)
 * Up to 12 retries per obstacle; graceful skip on failure.
 */
function placeObstacles(
  leaves: readonly Rect[],
  walls: readonly WallSegment[],
  slots: readonly SlotDef[],
  rng: SeededRng,
  floorY: number,
): ArenaObstacle[] {
  const obstacles: ArenaObstacle[] = [];
  if (leaves.length === 0) return obstacles;
  const target = OBSTACLE_COUNT_MIN + rng.nextInt(OBSTACLE_COUNT_MAX - OBSTACLE_COUNT_MIN + 1);

  // Cumulative area distribution for weighted leaf selection.
  const areas = leaves.map((l) => l.w * l.h);
  const totalArea = areas.reduce((a, b) => a + b, 0);
  const pickLeaf = (): Rect => {
    let roll = rng.next() * totalArea;
    for (let i = 0; i < leaves.length; i++) {
      roll -= areas[i];
      if (roll <= 0) return leaves[i];
    }
    return leaves[leaves.length - 1];
  };

  for (let i = 0; i < target; i++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const isCircle = rng.next() < 0.5;
      const half = isCircle
        ? OBSTACLE_CIRCLE_R_MIN + rng.next() * (OBSTACLE_CIRCLE_R_MAX - OBSTACLE_CIRCLE_R_MIN)
        : OBSTACLE_DIAMOND_HALF_MIN + rng.next() * (OBSTACLE_DIAMOND_HALF_MAX - OBSTACLE_DIAMOND_HALF_MIN);
      const leaf = pickLeaf();
      const margin = half + 20;
      if (leaf.w < margin * 2 || leaf.h < margin * 2) continue;
      const x = leaf.x + margin + rng.next() * (leaf.w - margin * 2);
      const y = leaf.y + margin + rng.next() * (leaf.h - margin * 2);
      if (y > floorY - half) continue;
      if (tooCloseToAnyWall(x, y, walls, half + 30)) continue;
      if (tooCloseToAnySlot(x, y, slots, half + 80)) continue;
      if (tooCloseToAnyObstacle(x, y, half, obstacles, 40)) continue;
      obstacles.push(isCircle
        ? { kind: 'circle', x, y, r: half }
        : { kind: 'diamond', x, y, half });
      break;
    }
  }
  return obstacles;
}

function tooCloseToAnySlot(x: number, y: number, slots: readonly SlotDef[], minD: number): boolean {
  const minSq = minD * minD;
  for (const s of slots) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < minSq) return true;
  }
  return false;
}

function tooCloseToAnyObstacle(
  x: number, y: number, r: number,
  obstacles: readonly ArenaObstacle[],
  buffer: number,
): boolean {
  for (const o of obstacles) {
    const otherR = o.kind === 'diamond' ? o.half : o.r;
    const minD = r + otherR + buffer;
    const dx = o.x - x;
    const dy = o.y - y;
    if (dx * dx + dy * dy < minD * minD) return true;
  }
  return false;
}

function tooCloseToExisting(x: number, y: number, slots: readonly SlotDef[], minD: number): boolean {
  for (const s of slots) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < minD * minD) return true;
  }
  return false;
}

function tooCloseToAnyWall(x: number, y: number, walls: readonly WallSegment[], minD: number): boolean {
  const minSq = minD * minD;
  for (const w of walls) {
    if (pointToSegmentSq(x, y, w.x1, w.y1, w.x2, w.y2) < minSq) return true;
  }
  return false;
}

function pointToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const rx = px - x1;
    const ry = py - y1;
    return rx * rx + ry * ry;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  const rx = px - qx;
  const ry = py - qy;
  return rx * rx + ry * ry;
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
  return {
    seed: 0,
    walls: [],
    slots,
    obstacles: [],
    floorY,
    playfield: { width: params.width, height: params.height },
  };
}
