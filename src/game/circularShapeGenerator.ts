import type { SeededRng } from './rng';
import {
  cellKey,
  makeChunkId,
  TRIANGLE_COMPLEMENT,
  type AsteroidShape,
  type CellKey,
  type ChunkCell,
  type ChunkEntry,
  type ChunkShape,
} from './shape';

/** Probability that a placed triangle gets paired with its complement. */
const PAIR_PROBABILITY = 0.3;

export class CircularShapeGenerator {
  constructor(private readonly rng: SeededRng) {}

  generate(targetChunkCount: number, triangleProbability: number): AsteroidShape {
    const target = Math.max(1, targetChunkCount);
    const triProb = Math.max(0, Math.min(1, triangleProbability));

    const cells: ChunkCell[] = [];
    const chunksByCell = new Map<CellKey, ChunkEntry[]>();
    const adjacency = new Map<string, Set<string>>(); // keyed by chunkId
    let totalChunks = 0;

    const placeCell = (cell: ChunkCell, shape: ChunkShape): number => {
      const key = cellKey(cell.x, cell.y);
      const isNew = !chunksByCell.has(key);
      if (isNew) cells.push(cell);

      const entries = chunksByCell.get(key) ?? [];
      const idx = entries.length;
      const id = makeChunkId(key, idx);
      const entry: ChunkEntry = { shape, chunkId: id, cell };
      entries.push(entry);
      chunksByCell.set(key, entries);
      adjacency.set(id, new Set());

      // Connect to chunks in neighboring cells.
      for (const nb of this.gridNeighbors(cell)) {
        const nbKey = cellKey(nb.x, nb.y);
        const nbEntries = chunksByCell.get(nbKey);
        if (!nbEntries) continue;
        for (const nbEntry of nbEntries) {
          if (this.edgesConnect(shape, cell, nbEntry.shape, nb)) {
            adjacency.get(id)!.add(nbEntry.chunkId);
            adjacency.get(nbEntry.chunkId)!.add(id);
          }
        }
      }

      // Connect to other chunks in the SAME cell (paired triangles).
      for (const other of entries) {
        if (other.chunkId === id) continue;
        adjacency.get(id)!.add(other.chunkId);
        adjacency.get(other.chunkId)!.add(id);
      }

      totalChunks++;
      return totalChunks;
    };

    // Seed cell.
    const seed: ChunkCell = { x: 0, y: 0 };
    // Seed cell has no neighbors — always place a square.
    const seedShape: ChunkShape = 'square';
    placeCell(seed, seedShape);

    // Maybe pair the seed triangle.
    if (seedShape !== 'square' && totalChunks < target && this.rng.next() < PAIR_PROBABILITY) {
      const comp = TRIANGLE_COMPLEMENT[seedShape];
      if (comp) placeCell(seed, comp);
    }

    const candidates = new Map<CellKey, ChunkCell>();
    this.queueNeighborsAsCandidates(seed, candidates, chunksByCell);

    while (totalChunks < target && candidates.size > 0) {
      const chosen = this.pickWeightedCandidate(candidates, cells);
      const key = cellKey(chosen.x, chosen.y);
      candidates.delete(key);

      const shape = this.pickShapeForCell(chosen, chunksByCell, triProb);

      placeCell(chosen, shape);

      // Maybe pair a triangle with its complement.
      if (shape !== 'square' && totalChunks < target && this.rng.next() < PAIR_PROBABILITY) {
        const comp = TRIANGLE_COMPLEMENT[shape];
        if (comp) placeCell(chosen, comp);
      }

      this.queueNeighborsAsCandidates(chosen, candidates, chunksByCell);
    }

    return { cells, chunksByCell, adjacency };
  }

  /**
   * Determine if two shapes in adjacent cells share an edge.
   * Squares share an edge with any neighbor.
   * Triangles only share edges along their straight sides, not through empty space.
   */
  private edgesConnect(
    shapeA: ChunkShape, cellA: ChunkCell,
    shapeB: ChunkShape, cellB: ChunkCell,
  ): boolean {
    const dx = cellB.x - cellA.x;
    const dy = cellB.y - cellA.y;

    // Determine direction from A to B.
    // dy > 0 means B is north of A, dy < 0 means south.
    // dx > 0 means B is east of A, dx < 0 means west.
    const aFacesB = this.shapeHasEdgeFacing(shapeA, dx, dy);
    const bFacesA = this.shapeHasEdgeFacing(shapeB, -dx, -dy);
    return aFacesB && bFacesA;
  }

  /**
   * Does this shape have a straight edge facing the given direction?
   * Squares have edges in all 4 directions.
   * Triangles have edges only along their two legs (not their hypotenuse side).
   *
   * Triangle edge map (which directions each triangle has a straight edge toward):
   *   triNE: N edge (top), E edge (right)    — hypotenuse faces SW
   *   triNW: N edge (top), W edge (left)     — hypotenuse faces SE
   *   triSE: S edge (bottom), E edge (right) — hypotenuse faces NW
   *   triSW: S edge (bottom), W edge (left)  — hypotenuse faces NE
   */
  private shapeHasEdgeFacing(shape: ChunkShape, dx: number, dy: number): boolean {
    if (shape === 'square') return true;

    // Direction as N/S/E/W.
    if (dy > 0) { // facing north
      return shape === 'triNE' || shape === 'triNW';
    }
    if (dy < 0) { // facing south
      return shape === 'triSE' || shape === 'triSW';
    }
    if (dx > 0) { // facing east
      return shape === 'triNE' || shape === 'triSE';
    }
    if (dx < 0) { // facing west
      return shape === 'triNW' || shape === 'triSW';
    }
    return false;
  }

  /**
   * Pick a shape for a cell, verifying that the chosen shape actually
   * connects edge-to-edge with at least one existing neighbor.
   */
  private pickShapeForCell(
    cell: ChunkCell,
    placed: Map<CellKey, ChunkEntry[]>,
    triangleProbability: number,
  ): ChunkShape {
    if (triangleProbability <= 0 || this.rng.next() >= triangleProbability) {
      return 'square';
    }

    // Collect triangle shapes that have at least one valid edge connection
    // with an already-placed neighbor.
    const valid: ChunkShape[] = [];
    const triCandidates: ChunkShape[] = ['triNE', 'triNW', 'triSE', 'triSW'];

    for (const tri of triCandidates) {
      for (const nb of this.gridNeighbors(cell)) {
        const nbKey = cellKey(nb.x, nb.y);
        const nbEntries = placed.get(nbKey);
        if (!nbEntries) continue;
        // Check if this triangle would connect to at least one chunk in the neighbor cell.
        for (const nbEntry of nbEntries) {
          if (this.edgesConnect(tri, cell, nbEntry.shape, nb)) {
            valid.push(tri);
            break; // one valid connection is enough
          }
        }
        if (valid.includes(tri)) break; // already validated this triangle
      }
    }

    if (valid.length === 0) {
      return 'square';
    }

    return valid[this.rng.nextInt(valid.length)];
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
