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
  readonly chunkId: string;
  readonly cell: ChunkCell;
}

export function makeChunkId(key: CellKey, index: number): string {
  return `${key}:${index}`;
}

export interface AsteroidShape {
  readonly cells: readonly ChunkCell[];
  readonly chunksByCell: ReadonlyMap<CellKey, readonly ChunkEntry[]>;
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>;
  /** ChunkId of the centroid (seed) chunk, reserved for future core mechanic. */
  readonly coreChunkId: string;
}

export function canonicalEdge(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
