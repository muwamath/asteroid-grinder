import { describe, expect, it } from 'vitest';
import { connectedComponents } from './connectedComponents';

const adjacency = (edges: Array<[string, string]>): Map<string, Set<string>> => {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string): void => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  for (const [a, b] of edges) {
    add(a, b);
    add(b, a);
  }
  return m;
};

describe('connectedComponents', () => {
  it('returns one component for a fully connected graph', () => {
    const g = adjacency([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]);
    const components = connectedComponents(g);
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('splits into two components when an edge is removed', () => {
    const g = adjacency([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const components = connectedComponents(g);
    expect(components).toHaveLength(2);
    const sizes = components.map((c) => c.length).sort();
    expect(sizes).toEqual([2, 2]);
  });

  it('handles an isolated node with an empty neighbor set', () => {
    const g = new Map<string, Set<string>>();
    g.set('solo', new Set());
    const components = connectedComponents(g);
    expect(components).toHaveLength(1);
    expect(components[0]).toEqual(['solo']);
  });

  it('ignores dangling neighbor keys that are not in the graph', () => {
    // Simulates the "post-detach" state where an Asteroid has sliced a cell
    // out but dead neighbors still point at it.
    const g = new Map<string, Set<string>>();
    g.set('a', new Set(['b', 'ghost']));
    g.set('b', new Set(['a']));
    const components = connectedComponents(g);
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['a', 'b']);
  });
});
