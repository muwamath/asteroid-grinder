export interface ChunkTarget {
  /** Stable identity across frames. Use to re-acquire a target in later frames. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Velocity in Matter units (px/tick at 60 Hz). */
  readonly vx: number;
  readonly vy: number;
  readonly dead: boolean;
  readonly tier: number;
  /** Apply `amount` damage. Returns true if this call killed the chunk. */
  damage(amount: number): boolean;
}
