export function connectedComponents<K>(
  adjacency: ReadonlyMap<K, ReadonlySet<K>>,
): K[][] {
  const visited = new Set<K>();
  const components: K[][] = [];

  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;

    const component: K[] = [];
    const queue: K[] = [start];
    visited.add(start);

    while (queue.length > 0) {
      const node = queue.shift() as K;
      component.push(node);

      const neighbors = adjacency.get(node);
      if (!neighbors) continue;

      for (const n of neighbors) {
        if (!adjacency.has(n)) continue;
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    components.push(component);
  }

  return components;
}
