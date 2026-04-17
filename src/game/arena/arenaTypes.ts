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

export interface ArenaLayout {
  readonly seed: number;
  readonly walls: readonly WallSegment[];
  readonly slots: readonly SlotDef[];
  readonly floorY: number;
  readonly playfield: { readonly width: number; readonly height: number };
}

export interface ArenaSeedParams {
  readonly width: number;
  readonly height: number;
  readonly minSlots: number;
  readonly maxSlots: number;
}
