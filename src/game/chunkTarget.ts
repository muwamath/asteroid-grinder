export interface ChunkTarget {
  readonly x: number;
  readonly y: number;
  readonly dead: boolean;
  readonly tier: number;
  damage(amount: number): boolean;
}
