export interface WallSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface SlotDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly normalAngleRad: number;
  readonly leafId: string;
}

/**
 * Static obstacles placed among the walls to add mayhem. Kinds:
 *  - `circle`   — medium deflector; chunks bounce off (2–4 per map)
 *  - `diamond`  — axis-aligned square rotated 45° (2–4 per map)
 *  - `peg`      — small pachinko peg, mostly flavour (4–12 per map)
 */
export type ArenaObstacle =
  | { readonly kind: 'circle';  readonly x: number; readonly y: number; readonly r: number }
  | { readonly kind: 'diamond'; readonly x: number; readonly y: number; readonly half: number }
  | { readonly kind: 'peg';     readonly x: number; readonly y: number; readonly r: number };

export interface ArenaLayout {
  readonly seed: number;
  readonly walls: readonly WallSegment[];
  readonly slots: readonly SlotDef[];
  readonly obstacles: readonly ArenaObstacle[];
  readonly floorY: number;
  readonly playfield: { readonly width: number; readonly height: number };
}

export interface ArenaSeedParams {
  readonly width: number;
  readonly height: number;
  readonly minSlots: number;
  readonly maxSlots: number;
}
