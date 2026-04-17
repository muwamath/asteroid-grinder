import type { ArenaLayout, WallSegment } from './arenaTypes';

const MIN_CLEARANCE = 160;
const RAY_SAMPLE_STEP = 40;
const SPAWN_SAFE_MARGIN = 40;

export function minWallSlantDeg(walls: readonly WallSegment[]): number {
  if (walls.length === 0) return Infinity;
  let min = Infinity;
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const deg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    const offHorizontal = Math.min(deg, 180 - deg);
    if (offHorizontal < min) min = offHorizontal;
  }
  return min;
}

export function isPlayable(layout: ArenaLayout): boolean {
  const { walls, playfield, floorY } = layout;
  if (walls.length === 0) return true;
  for (let x = SPAWN_SAFE_MARGIN; x < playfield.width - SPAWN_SAFE_MARGIN; x += RAY_SAMPLE_STEP) {
    if (!rayReachesFloor(x, walls, floorY, playfield)) return false;
  }
  return true;
}

function rayReachesFloor(
  x: number,
  walls: readonly WallSegment[],
  floorY: number,
  playfield: { width: number; height: number },
): boolean {
  let y = 0;
  let cursor = x;
  for (let step = 0; step < 200; step++) {
    const hit = firstWallBelow(cursor, y, walls);
    if (!hit || hit.y > floorY) return true;
    const gapX = findGapX(hit, playfield);
    if (gapX == null) return false;
    cursor = gapX;
    y = hit.y + MIN_CLEARANCE;
    if (y >= floorY) return true;
  }
  return false;
}

function firstWallBelow(
  x: number,
  y: number,
  walls: readonly WallSegment[],
): { y: number; wall: WallSegment } | null {
  let best: { y: number; wall: WallSegment } | null = null;
  for (const w of walls) {
    const xMin = Math.min(w.x1, w.x2);
    const xMax = Math.max(w.x1, w.x2);
    if (x < xMin || x > xMax) continue;
    const denom = w.x2 - w.x1;
    const t = denom === 0 ? 0 : (x - w.x1) / denom;
    const wy = w.y1 + t * (w.y2 - w.y1);
    if (wy <= y) continue;
    if (!best || wy < best.y) best = { y: wy, wall: w };
  }
  return best;
}

function findGapX(
  hit: { y: number; wall: WallSegment },
  playfield: { width: number },
): number | null {
  const wall = hit.wall;
  const xMin = Math.min(wall.x1, wall.x2);
  const xMax = Math.max(wall.x1, wall.x2);
  const leftGapValid = xMin > SPAWN_SAFE_MARGIN + MIN_CLEARANCE / 2;
  const rightGapValid = xMax < playfield.width - SPAWN_SAFE_MARGIN - MIN_CLEARANCE / 2;
  if (leftGapValid) return xMin - MIN_CLEARANCE / 2;
  if (rightGapValid) return xMax + MIN_CLEARANCE / 2;
  return null;
}
