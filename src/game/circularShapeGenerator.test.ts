import { describe, expect, it } from 'vitest';
import { CircularShapeGenerator } from './circularShapeGenerator';
import { SeededRng } from './rng';
import { connectedComponents } from './connectedComponents';
import { cellKey } from './shape';

describe('CircularShapeGenerator', () => {
  it('produces exactly the requested chunk count', () => {
    const gen = new CircularShapeGenerator(new SeededRng(12345));
    const shape = gen.generate(11, 0.3);
    expect(shape.cells.length).toBe(11);
    expect(shape.shapeByCell.size).toBe(11);
    expect(shape.adjacency.size).toBe(11);
  });

  it('produces a fully connected adjacency graph', () => {
    const gen = new CircularShapeGenerator(new SeededRng(9001));
    const shape = gen.generate(14, 0.4);
    const components = connectedComponents(shape.adjacency);
    expect(components).toHaveLength(1);
    expect(components[0]).toHaveLength(14);
  });

  it('is deterministic for the same seed', () => {
    const a = new CircularShapeGenerator(new SeededRng(42)).generate(10, 0.5);
    const b = new CircularShapeGenerator(new SeededRng(42)).generate(10, 0.5);
    expect(a.cells).toEqual(b.cells);
  });

  it('handles a 1-chunk shape', () => {
    const gen = new CircularShapeGenerator(new SeededRng(1));
    const shape = gen.generate(1, 0.5);
    expect(shape.cells).toHaveLength(1);
    expect(shape.cells[0]).toEqual({ x: 0, y: 0 });
    expect(shape.adjacency.get(cellKey(0, 0))?.size).toBe(0);
  });

  it('clamps triangle probability to [0, 1]', () => {
    const gen = new CircularShapeGenerator(new SeededRng(7));
    const shape = gen.generate(6, 10);
    expect(shape.cells.length).toBe(6);
  });
});
