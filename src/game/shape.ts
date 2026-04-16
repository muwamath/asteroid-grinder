export interface ChunkCell {
  readonly x: number;
  readonly y: number;
}

export type CellKey = string;

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function keyForCell(cell: ChunkCell): CellKey {
  return cellKey(cell.x, cell.y);
}

export type ChunkShape = 'square' | 'triNE' | 'triNW' | 'triSE' | 'triSW';

/** A single chunk within a cell. A cell may hold 1 square or 1–2 triangles. */
export interface ChunkEntry {
  readonly shape: ChunkShape;
  readonly chunkId: string; // unique within the asteroid, e.g. "0,0:0"
  readonly cell: ChunkCell;
}

export function makeChunkId(key: CellKey, index: number): string {
  return `${key}:${index}`;
}

/** Maps of complementary triangle pairs that can share a cell. */
export const TRIANGLE_COMPLEMENT: Partial<Record<ChunkShape, ChunkShape>> = {
  triNE: 'triSW',
  triSW: 'triNE',
  triNW: 'triSE',
  triSE: 'triNW',
};

export interface AsteroidShape {
  readonly cells: readonly ChunkCell[];
  readonly chunksByCell: ReadonlyMap<CellKey, readonly ChunkEntry[]>;
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>; // keyed by chunkId
}

export function canonicalEdge(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
