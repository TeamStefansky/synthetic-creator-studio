// Pure graph algorithms (layer 03 · P3). No graph dependency. Connected
// components, articulation edges (bridges) via DFS lowlink, and topological
// ordering for the propagation path. Deterministic (inputs sorted).

export interface UndirectedEdge { a: string; b: string }
export interface DirectedEdge { from: string; to: string }

function adjacency(nodes: string[], edges: UndirectedEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  for (const [, v] of adj) v.sort();
  return adj;
}

/** Connected components (each a sorted node list). Isolated nodes are singletons. */
export function connectedComponents(nodes: string[], edges: UndirectedEdge[]): string[][] {
  const adj = adjacency(nodes, edges);
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of [...adj.keys()].sort()) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp: string[] = [];
    seen.add(start);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
    comps.push(comp.sort());
  }
  return comps.sort((x, y) => x[0].localeCompare(y[0]));
}

/**
 * Articulation edges (bridges): edges whose removal increases the number of
 * connected components. Standard DFS lowlink. Returns them normalized (a<b).
 */
export function bridges(nodes: string[], edges: UndirectedEdge[]): UndirectedEdge[] {
  const adj = adjacency(nodes, edges);
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const out: UndirectedEdge[] = [];
  let timer = 0;

  const dfs = (u: string, parent: string | null) => {
    disc.set(u, timer); low.set(u, timer); timer++;
    let skippedParentOnce = false;
    for (const v of adj.get(u) || []) {
      if (v === parent && !skippedParentOnce) { skippedParentOnce = true; continue; } // handle one parent edge (multigraph-safe)
      if (!disc.has(v)) {
        dfs(v, u);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > disc.get(u)!) { const [a, b] = [u, v].sort(); out.push({ a, b }); }
      } else {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  };

  for (const n of [...adj.keys()].sort()) if (!disc.has(n)) dfs(n, null);
  // Dedup + sort.
  const key = (e: UndirectedEdge) => `${e.a}␟${e.b}`;
  const uniq = new Map(out.map((e) => [key(e), e]));
  return [...uniq.values()].sort((x, y) => key(x).localeCompare(key(y)));
}

/** Topological order, or null if the directed graph has a cycle. Deterministic. */
export function topoOrder(nodes: string[], edges: DirectedEdge[]): string[] | null {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { indeg.set(n, 0); adj.set(n, []); }
  for (const e of edges) {
    if (!indeg.has(e.from)) { indeg.set(e.from, 0); adj.set(e.from, []); }
    if (!indeg.has(e.to)) { indeg.set(e.to, 0); adj.set(e.to, []); }
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, indeg.get(e.to)! + 1);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([n]) => n).sort();
  const order: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    for (const v of (adj.get(u) || []).sort()) {
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) { queue.push(v); queue.sort(); }
    }
  }
  return order.length === indeg.size ? order : null;
}
