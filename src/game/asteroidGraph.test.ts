import { describe, expect, it } from 'vitest';
import { applyKillAndSplit } from './asteroidGraph';

function graphOf(edges: Array<[string, string]>): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  const touch = (k: string) => {
    if (!g.has(k)) g.set(k, new Set());
    return g.get(k)!;
  };
  for (const [a, b] of edges) {
    touch(a).add(b);
    touch(b).add(a);
  }
  return g;
}

describe('applyKillAndSplit', () => {
  it('removes a leaf chunk without splitting', () => {
    const g = graphOf([['A', 'B'], ['B', 'C']]);
    const { prunedAdjacency, components } = applyKillAndSplit(g, 'C');
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['A', 'B']);
    expect(prunedAdjacency.has('C')).toBe(false);
    expect(prunedAdjacency.get('B')?.has('C')).toBe(false);
  });

  it('splits a chain into two components when bridge chunk dies', () => {
    const g = graphOf([
      ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'],
    ]);
    const { components } = applyKillAndSplit(g, 'c');
    expect(components).toHaveLength(2);
    const sorted = components.map((c) => c.sort()).sort((x, y) => x[0].localeCompare(y[0]));
    expect(sorted[0]).toEqual(['a', 'b']);
    expect(sorted[1]).toEqual(['d', 'e']);
  });

  it('keeps a ring connected when a single node dies', () => {
    const g = graphOf([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]);
    const { components } = applyKillAndSplit(g, 'b');
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['a', 'c', 'd']);
  });

  it('returns zero components when the last node dies', () => {
    const g = new Map<string, Set<string>>();
    g.set('only', new Set());
    const { components, prunedAdjacency } = applyKillAndSplit(g, 'only');
    expect(components).toHaveLength(0);
    expect(prunedAdjacency.size).toBe(0);
  });

  it('is non-destructive on the input map', () => {
    const g = graphOf([['a', 'b']]);
    applyKillAndSplit(g, 'a');
    expect(g.get('a')?.has('b')).toBe(true);
    expect(g.get('b')?.has('a')).toBe(true);
  });
});
