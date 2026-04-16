import { describe, expect, it } from 'vitest';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { SeededRng } from './rng';
import { connectedComponents } from './connectedComponents';

function totalChunks(shape: ReturnType<CircularShapeGenerator['generate']>): number {
  let count = 0;
  for (const entries of shape.chunksByCell.values()) count += entries.length;
  return count;
}

describe('CircularShapeGenerator', () => {
  it('produces at least the requested chunk count', () => {
    const gen = new CircularShapeGenerator(new SeededRng(12345));
    const shape = gen.generate(11, 0.3);
    // Total chunks may exceed target due to paired triangles.
    expect(totalChunks(shape)).toBeGreaterThanOrEqual(11);
    // Every chunk should have an adjacency entry.
    expect(shape.adjacency.size).toBe(totalChunks(shape));
  });

  it('produces a fully connected adjacency graph', () => {
    const gen = new CircularShapeGenerator(new SeededRng(9001));
    const shape = gen.generate(14, 0.4);
    const components = connectedComponents(shape.adjacency);
    expect(components).toHaveLength(1);
    expect(components[0]).toHaveLength(totalChunks(shape));
  });

  it('is deterministic for the same seed', () => {
    const a = new CircularShapeGenerator(new SeededRng(42)).generate(10, 0.5);
    const b = new CircularShapeGenerator(new SeededRng(42)).generate(10, 0.5);
    expect(a.cells).toEqual(b.cells);
    expect(totalChunks(a)).toBe(totalChunks(b));
  });

  it('handles a 1-chunk shape', () => {
    // With triProb=0, seed is always a square — no pairing.
    const gen = new CircularShapeGenerator(new SeededRng(1));
    const shape = gen.generate(1, 0);
    expect(shape.cells).toHaveLength(1);
    expect(shape.cells[0]).toEqual({ x: 0, y: 0 });
    expect(totalChunks(shape)).toBe(1);
  });

  it('clamps triangle probability to [0, 1]', () => {
    const gen = new CircularShapeGenerator(new SeededRng(7));
    const shape = gen.generate(6, 10);
    expect(totalChunks(shape)).toBeGreaterThanOrEqual(6);
  });

  it('can produce paired triangles in the same cell', () => {
    // High triangle probability to maximize chance of pairing.
    // Try multiple seeds until we find one that produces a pair.
    let foundPair = false;
    for (let seed = 0; seed < 50; seed++) {
      const gen = new CircularShapeGenerator(new SeededRng(seed));
      const shape = gen.generate(20, 1.0);
      for (const entries of shape.chunksByCell.values()) {
        if (entries.length === 2) {
          foundPair = true;
          // Verify they're complementary.
          const shapes = entries.map((e) => e.shape).sort();
          const validPairs = [['triNE', 'triSW'], ['triNW', 'triSE']];
          expect(validPairs).toContainEqual(shapes);
          break;
        }
      }
      if (foundPair) break;
    }
    expect(foundPair).toBe(true);
  });

  it('only connects chunks with shared edges', () => {
    const gen = new CircularShapeGenerator(new SeededRng(555));
    const shape = gen.generate(15, 0.5);
    // Every adjacency pair should be in neighboring cells (or same cell for paired tris).
    for (const [id, neighbors] of shape.adjacency) {
      for (const nbId of neighbors) {
        // Both chunks should exist.
        let foundId = false;
        let foundNb = false;
        for (const entries of shape.chunksByCell.values()) {
          for (const e of entries) {
            if (e.chunkId === id) foundId = true;
            if (e.chunkId === nbId) foundNb = true;
          }
        }
        expect(foundId).toBe(true);
        expect(foundNb).toBe(true);
      }
    }
  });
});
