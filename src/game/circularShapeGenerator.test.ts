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
  it('produces exactly the requested chunk count (squares-only)', () => {
    const gen = new CircularShapeGenerator(new SeededRng(12345));
    const shape = gen.generate(11);
    expect(totalChunks(shape)).toBe(11);
    expect(shape.adjacency.size).toBe(11);
  });

  it('produces a fully connected adjacency graph', () => {
    const gen = new CircularShapeGenerator(new SeededRng(9001));
    const shape = gen.generate(14);
    const components = connectedComponents(shape.adjacency);
    expect(components).toHaveLength(1);
    expect(components[0]).toHaveLength(totalChunks(shape));
  });

  it('is deterministic for the same seed', () => {
    const a = new CircularShapeGenerator(new SeededRng(42)).generate(10);
    const b = new CircularShapeGenerator(new SeededRng(42)).generate(10);
    expect(a.cells).toEqual(b.cells);
    expect(totalChunks(a)).toBe(totalChunks(b));
  });

  it('handles a 1-chunk shape', () => {
    const gen = new CircularShapeGenerator(new SeededRng(1));
    const shape = gen.generate(1);
    expect(shape.cells).toHaveLength(1);
    expect(shape.cells[0]).toEqual({ x: 0, y: 0 });
    expect(totalChunks(shape)).toBe(1);
  });

  it('marks the centroid (seed cell) as coreChunkId', () => {
    const gen = new CircularShapeGenerator(new SeededRng(77));
    const shape = gen.generate(9);
    const seedEntries = shape.chunksByCell.get('0,0');
    expect(seedEntries?.some((e) => e.chunkId === shape.coreChunkId)).toBe(true);
  });

  it('only connects chunks in neighboring cells', () => {
    const gen = new CircularShapeGenerator(new SeededRng(555));
    const shape = gen.generate(15);
    for (const [id, neighbors] of shape.adjacency) {
      for (const nbId of neighbors) {
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
