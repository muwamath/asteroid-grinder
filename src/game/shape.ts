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

export interface AsteroidShape {
  readonly cells: readonly ChunkCell[];
  readonly shapeByCell: ReadonlyMap<CellKey, ChunkShape>;
  readonly adjacency: ReadonlyMap<CellKey, ReadonlySet<CellKey>>;
}

export function canonicalEdge(a: CellKey, b: CellKey): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
