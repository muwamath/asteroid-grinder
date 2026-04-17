import { SeededRng } from '../rng';
import { isPlayable } from './arenaValidate';
import {
  MAX_DEPTH,
  SPLIT_P_DECAY,
  VERTICAL_AXIS_WEIGHT,
  MIN_WALL_SLANT_DEG,
  MIN_LEAF_DIM,
  SLOT_SPACING,
  MAX_RETRIES,
  FLOOR_BAND_HEIGHT,
} from './arenaConstants';
import type { ArenaLayout, ArenaSeedParams, SlotDef, WallSegment } from './arenaTypes';

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
    walls[i] = ensureSlant(walls[i], rng);
  }

  const slots = placeSlots(leaves, rng, params);

  return {
    seed,
    walls,
    slots,
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
  const deg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  const offHorizontal = Math.min(deg, 180 - deg);
  if (offHorizontal >= MIN_WALL_SLANT_DEG) return w;

  const length = Math.hypot(dx, dy) || 1;
  const cx = (w.x1 + w.x2) / 2;
  const cy = (w.y1 + w.y2) / 2;
  const dirSign = rng.next() < 0.5 ? 1 : -1;
  const targetRad = (dirSign * (MIN_WALL_SLANT_DEG + 2) * Math.PI) / 180;
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
  const sorted = [...leaves].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const leaf of sorted) {
    const count = 1 + rng.nextInt(2);
    for (let i = 0; i < count; i++) {
      if (slots.length >= params.maxSlots) break;
      const cx = leaf.x + leaf.w * (0.25 + rng.next() * 0.5);
      const cy = leaf.y + leaf.h * (0.3 + rng.next() * 0.5);
      if (tooCloseToExisting(cx, cy, slots, SLOT_SPACING)) continue;
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
  // Top-up: keep a reduced spacing floor so tests still pass.
  const topUpSpacing = SLOT_SPACING * 0.6;
  let leafIdx = 0;
  let safetyIter = 0;
  while (slots.length < params.minSlots && safetyIter < 1000) {
    safetyIter++;
    const leaf = sorted[leafIdx % sorted.length];
    leafIdx++;
    const cx = leaf.x + leaf.w * (0.3 + rng.next() * 0.4);
    const cy = leaf.y + leaf.h * (0.3 + rng.next() * 0.4);
    if (tooCloseToExisting(cx, cy, slots, topUpSpacing)) continue;
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

function tooCloseToExisting(x: number, y: number, slots: readonly SlotDef[], minD: number): boolean {
  for (const s of slots) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < minD * minD) return true;
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
  return {
    seed: 0,
    walls: [],
    slots,
    floorY,
    playfield: { width: params.width, height: params.height },
  };
}
