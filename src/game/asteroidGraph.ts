import { connectedComponents } from './connectedComponents';

export interface KillAndSplitResult {
  readonly prunedAdjacency: Map<string, Set<string>>;
  readonly components: string[][];
}

export function applyKillAndSplit(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  killedChunkId: string,
): KillAndSplitResult {
  const pruned = new Map<string, Set<string>>();
  for (const [k, v] of adjacency) {
    if (k === killedChunkId) continue;
    const next = new Set<string>();
    for (const n of v) if (n !== killedChunkId) next.add(n);
    pruned.set(k, next);
  }
  const components = connectedComponents(pruned);
  return { prunedAdjacency: pruned, components };
}
