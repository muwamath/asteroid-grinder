import type { SeededRng } from './rng';
import {
  cellKey,
  makeChunkId,
  type AsteroidShape,
  type CellKey,
  type ChunkCell,
  type ChunkEntry,
} from './shape';

export class CircularShapeGenerator {
  constructor(private readonly rng: SeededRng) {}

  generate(targetChunkCount: number): AsteroidShape {
    const target = Math.max(1, targetChunkCount);

    const cells: ChunkCell[] = [];
    const chunksByCell = new Map<CellKey, ChunkEntry[]>();
    const adjacency = new Map<string, Set<string>>();
    let totalChunks = 0;

    const placeCell = (cell: ChunkCell): string => {
      const key = cellKey(cell.x, cell.y);
      const isNew = !chunksByCell.has(key);
      if (isNew) cells.push(cell);

      const entries = chunksByCell.get(key) ?? [];
      const idx = entries.length;
      const id = makeChunkId(key, idx);
      const entry: ChunkEntry = { chunkId: id, cell };
      entries.push(entry);
      chunksByCell.set(key, entries);
      adjacency.set(id, new Set());

      for (const nb of this.gridNeighbors(cell)) {
        const nbKey = cellKey(nb.x, nb.y);
        const nbEntries = chunksByCell.get(nbKey);
        if (!nbEntries) continue;
        for (const nbEntry of nbEntries) {
          adjacency.get(id)!.add(nbEntry.chunkId);
          adjacency.get(nbEntry.chunkId)!.add(id);
        }
      }

      totalChunks++;
      return id;
    };

    const seed: ChunkCell = { x: 0, y: 0 };
    const coreChunkId = placeCell(seed);

    const candidates = new Map<CellKey, ChunkCell>();
    this.queueNeighborsAsCandidates(seed, candidates, chunksByCell);

    while (totalChunks < target && candidates.size > 0) {
      const chosen = this.pickWeightedCandidate(candidates, cells);
      const key = cellKey(chosen.x, chosen.y);
      candidates.delete(key);

      placeCell(chosen);

      this.queueNeighborsAsCandidates(chosen, candidates, chunksByCell);
    }

    return { cells, chunksByCell, adjacency, coreChunkId };
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
    placed: Map<CellKey, ChunkEntry[]>,
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
