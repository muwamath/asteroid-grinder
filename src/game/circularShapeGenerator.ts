import type { SeededRng } from './rng';
import {
  cellKey,
  type AsteroidShape,
  type CellKey,
  type ChunkCell,
  type ChunkShape,
} from './shape';

const enum NeighborMask {
  None = 0,
  N = 1,
  S = 2,
  E = 4,
  W = 8,
}

export class CircularShapeGenerator {
  constructor(private readonly rng: SeededRng) {}

  generate(targetChunkCount: number, triangleProbability: number): AsteroidShape {
    const target = Math.max(1, targetChunkCount);
    const triProb = Math.max(0, Math.min(1, triangleProbability));

    const cells: ChunkCell[] = [];
    const shapeByCell = new Map<CellKey, ChunkShape>();
    const adjacency = new Map<CellKey, Set<CellKey>>();

    const seed: ChunkCell = { x: 0, y: 0 };
    this.place(seed, this.pickShape(NeighborMask.None, triProb), cells, shapeByCell, adjacency);

    const candidates = new Map<CellKey, ChunkCell>();
    this.queueNeighborsAsCandidates(seed, candidates, shapeByCell);

    while (cells.length < target && candidates.size > 0) {
      const chosen = this.pickWeightedCandidate(candidates, cells);
      const mask = this.placedNeighborMask(chosen, shapeByCell);
      const shape = this.pickShape(mask, triProb);

      this.place(chosen, shape, cells, shapeByCell, adjacency);
      candidates.delete(cellKey(chosen.x, chosen.y));
      this.queueNeighborsAsCandidates(chosen, candidates, shapeByCell);
    }

    return { cells, shapeByCell, adjacency };
  }

  private pickShape(mask: NeighborMask, triangleProbability: number): ChunkShape {
    if (triangleProbability <= 0 || this.rng.next() >= triangleProbability) {
      return 'square';
    }

    const valid: ChunkShape[] = [];
    if (mask & (NeighborMask.N | NeighborMask.E)) valid.push('triNE');
    if (mask & (NeighborMask.N | NeighborMask.W)) valid.push('triNW');
    if (mask & (NeighborMask.S | NeighborMask.E)) valid.push('triSE');
    if (mask & (NeighborMask.S | NeighborMask.W)) valid.push('triSW');

    if (valid.length === 0) {
      const all: ChunkShape[] = ['triNE', 'triNW', 'triSE', 'triSW'];
      return all[this.rng.nextInt(all.length)];
    }

    return valid[this.rng.nextInt(valid.length)];
  }

  private placedNeighborMask(cell: ChunkCell, placed: Map<CellKey, ChunkShape>): NeighborMask {
    let mask = NeighborMask.None;
    if (placed.has(cellKey(cell.x, cell.y + 1))) mask |= NeighborMask.N;
    if (placed.has(cellKey(cell.x, cell.y - 1))) mask |= NeighborMask.S;
    if (placed.has(cellKey(cell.x + 1, cell.y))) mask |= NeighborMask.E;
    if (placed.has(cellKey(cell.x - 1, cell.y))) mask |= NeighborMask.W;
    return mask;
  }

  private place(
    cell: ChunkCell,
    shape: ChunkShape,
    cells: ChunkCell[],
    shapeByCell: Map<CellKey, ChunkShape>,
    adjacency: Map<CellKey, Set<CellKey>>,
  ): void {
    const key = cellKey(cell.x, cell.y);
    cells.push(cell);
    shapeByCell.set(key, shape);
    adjacency.set(key, new Set());

    for (const nb of this.gridNeighbors(cell)) {
      const nbKey = cellKey(nb.x, nb.y);
      const nbSet = adjacency.get(nbKey);
      if (nbSet) {
        nbSet.add(key);
        adjacency.get(key)!.add(nbKey);
      }
    }
  }

  private pickWeightedCandidate(
    candidates: Map<CellKey, ChunkCell>,
    placed: readonly ChunkCell[],
  ): ChunkCell {
    let cx = 0;
    let cy = 0;
    for (const c of placed) {
      cx += c.x;
      cy += c.y;
    }
    cx /= placed.length;
    cy /= placed.length;

    const weights: Array<{ cell: ChunkCell; weight: number }> = [];
    let totalWeight = 0;

    for (const cell of candidates.values()) {
      const dx = cell.x - cx;
      const dy = cell.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const w = 1 / (dist + 0.5);
      weights.push({ cell, weight: w });
      totalWeight += w;
    }

    let roll = this.rng.next() * totalWeight;
    for (const entry of weights) {
      roll -= entry.weight;
      if (roll <= 0) return entry.cell;
    }
    return weights[weights.length - 1].cell;
  }

  private queueNeighborsAsCandidates(
    cell: ChunkCell,
    candidates: Map<CellKey, ChunkCell>,
    placed: Map<CellKey, ChunkShape>,
  ): void {
    for (const nb of this.gridNeighbors(cell)) {
      const key = cellKey(nb.x, nb.y);
      if (!placed.has(key)) candidates.set(key, nb);
    }
  }

  private *gridNeighbors(cell: ChunkCell): Generator<ChunkCell> {
    yield { x: cell.x + 1, y: cell.y };
    yield { x: cell.x - 1, y: cell.y };
    yield { x: cell.x, y: cell.y + 1 };
    yield { x: cell.x, y: cell.y - 1 };
  }
}
