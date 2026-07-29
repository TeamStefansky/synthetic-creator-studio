// lib/analysis/graph.ts — network algorithms (the "algorithmist").
//
// Upgrades the influence map's graph reasoning from ad-hoc ranking to computed,
// reproducible claims, each with a quality/significance figure:
//   - a partition carries its modularity Q; a weak partition is "not established",
//   - "bridge account" is exact Brandes betweenness, not an approximation,
//   - a co-occurrence edge is asserted ONLY if it beats a null model (chance),
//   - "acting in lockstep" is correlation vs a permutation null, not eyeballing.
//
// Pure, deterministic (fixed node ordering; a seeded PRNG for permutation nulls, so
// identical input → identical numbers — rule 8). No dependencies. Nodes are
// accounts/domains/infra — never people; this module ranks structure, it never
// attributes.

import { gammaln } from "./stats";

export const GRAPH_VERSION = "analysis-graph-v1";

// Below this modularity a partition is treated as NOT ESTABLISHED (no real
// community structure) rather than presented as findings. Standard rule of thumb.
export const MODULARITY_FLOOR = 0.3;

export interface Edge {
  a: string;
  b: string;
  w?: number;
}
export interface Graph {
  nodes: string[];
  edges: Edge[];
}

// Deterministic seeded PRNG (mulberry32) for permutation nulls — reproducible.
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Adjacency
// ---------------------------------------------------------------------------

interface Adj {
  index: Map<string, number>;
  nodes: string[];
  neighbors: { j: number; w: number }[][];
  degree: number[]; // weighted degree
  m2: number; // 2m (sum of weighted degrees)
}

function buildAdj(g: Graph): Adj {
  const index = new Map<string, number>();
  g.nodes.forEach((n, i) => index.set(n, i));
  const neighbors: { j: number; w: number }[][] = g.nodes.map(() => []);
  const degree = new Array(g.nodes.length).fill(0);
  for (const e of g.edges) {
    const i = index.get(e.a);
    const j = index.get(e.b);
    if (i == null || j == null || i === j) continue;
    const w = e.w ?? 1;
    neighbors[i].push({ j, w });
    neighbors[j].push({ j: i, w });
    degree[i] += w;
    degree[j] += w;
  }
  const m2 = degree.reduce((a, b) => a + b, 0);
  return { index, nodes: g.nodes, neighbors, degree, m2 };
}

// ---------------------------------------------------------------------------
// Modularity + Louvain (single-level local moving; deterministic)
// ---------------------------------------------------------------------------

/** Newman–Girvan modularity Q of a partition (community label per node). */
export function modularity(g: Graph, community: Record<string, number>): number {
  const adj = buildAdj(g);
  if (adj.m2 === 0) return 0;
  let q = 0;
  for (let i = 0; i < adj.nodes.length; i++) {
    const ci = community[adj.nodes[i]];
    for (const { j, w } of adj.neighbors[i]) {
      if (community[adj.nodes[j]] === ci) q += w;
    }
  }
  // subtract expected; sum over communities of (Σdegree_in_comm)²
  const commDeg = new Map<number, number>();
  for (let i = 0; i < adj.nodes.length; i++) {
    const c = community[adj.nodes[i]];
    commDeg.set(c, (commDeg.get(c) ?? 0) + adj.degree[i]);
  }
  let expected = 0;
  for (const d of commDeg.values()) expected += (d / adj.m2) ** 2;
  return q / adj.m2 - expected;
}

export interface Partition {
  community: Record<string, number>;
  modularity: number;
  communityCount: number;
  established: boolean; // modularity >= MODULARITY_FLOOR
}

/**
 * Louvain community detection — single-level local moving (Blondel et al.). Nodes
 * are visited in fixed order, so the result is deterministic. Returns the modularity
 * Q; a partition below MODULARITY_FLOOR is flagged `established: false` (no real
 * structure) instead of being presented as communities.
 */
export function louvain(g: Graph): Partition {
  const adj = buildAdj(g);
  const N = adj.nodes.length;
  if (N === 0 || adj.m2 === 0) {
    const community: Record<string, number> = {};
    adj.nodes.forEach((n, i) => (community[n] = i));
    return { community, modularity: 0, communityCount: N, established: false };
  }
  const comm = adj.nodes.map((_, i) => i); // each node its own community
  const sigmaTot = [...adj.degree]; // total degree of each community

  const weightToComm = (i: number): Map<number, number> => {
    const m = new Map<number, number>();
    for (const { j, w } of adj.neighbors[i]) {
      const c = comm[j];
      m.set(c, (m.get(c) ?? 0) + w);
    }
    return m;
  };

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 100) {
    improved = false;
    for (let i = 0; i < N; i++) {
      const ki = adj.degree[i];
      const own = comm[i];
      // remove i from its community
      sigmaTot[own] -= ki;
      const links = weightToComm(i);
      let bestC = own;
      let bestGain = 0;
      const selfLink = links.get(own) ?? 0;
      // gain of staying is the reference (0); evaluate each neighbor community
      for (const [c, kin] of links) {
        const gain = kin - (sigmaTot[c] * ki) / adj.m2;
        const baseline = selfLink - (sigmaTot[own] * ki) / adj.m2;
        if (gain - baseline > bestGain + 1e-12) {
          bestGain = gain - baseline;
          bestC = c;
        }
      }
      comm[i] = bestC;
      sigmaTot[bestC] += ki;
      if (bestC !== own) improved = true;
    }
  }

  // relabel communities to 0..k-1 in fixed order
  const relabel = new Map<number, number>();
  const community: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    if (!relabel.has(comm[i])) relabel.set(comm[i], relabel.size);
    community[adj.nodes[i]] = relabel.get(comm[i])!;
  }
  const q = modularity(g, community);
  return { community, modularity: q, communityCount: relabel.size, established: q >= MODULARITY_FLOOR };
}

// ---------------------------------------------------------------------------
// Centrality
// ---------------------------------------------------------------------------

/** Exact betweenness centrality — Brandes' algorithm (unweighted, undirected). */
export function betweenness(g: Graph): Record<string, number> {
  const adj = buildAdj(g);
  const N = adj.nodes.length;
  const cb = new Array(N).fill(0);
  for (let s = 0; s < N; s++) {
    const stack: number[] = [];
    const pred: number[][] = adj.nodes.map(() => []);
    const sigma = new Array(N).fill(0);
    const dist = new Array(N).fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    const queue: number[] = [s];
    while (queue.length) {
      const v = queue.shift()!;
      stack.push(v);
      for (const { j: w } of adj.neighbors[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }
    const delta = new Array(N).fill(0);
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) cb[w] += delta[w];
    }
  }
  // undirected: each pair counted twice
  const out: Record<string, number> = {};
  adj.nodes.forEach((n, i) => (out[n] = cb[i] / 2));
  return out;
}

/** PageRank via power iteration (deterministic). */
export function pagerank(g: Graph, damping = 0.85, iterations = 100, tol = 1e-9): Record<string, number> {
  const adj = buildAdj(g);
  const N = adj.nodes.length;
  if (N === 0) return {};
  let pr = new Array(N).fill(1 / N);
  for (let it = 0; it < iterations; it++) {
    const next = new Array(N).fill((1 - damping) / N);
    let dangling = 0;
    for (let i = 0; i < N; i++) if (adj.degree[i] === 0) dangling += pr[i];
    for (let i = 0; i < N; i++) {
      const share = adj.degree[i] > 0 ? (damping * pr[i]) / adj.degree[i] : 0;
      for (const { j, w } of adj.neighbors[i]) next[j] += share * w;
    }
    // redistribute dangling mass uniformly
    for (let i = 0; i < N; i++) next[i] += (damping * dangling) / N;
    let diff = 0;
    for (let i = 0; i < N; i++) diff += Math.abs(next[i] - pr[i]);
    pr = next;
    if (diff < tol) break;
  }
  const out: Record<string, number> = {};
  adj.nodes.forEach((n, i) => (out[n] = pr[i]));
  return out;
}

// ---------------------------------------------------------------------------
// Bipartite co-occurrence with a null-model significance test
// ---------------------------------------------------------------------------

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1);
}

/**
 * Hypergeometric upper-tail P(overlap >= k): given two accounts touching a=|A| and
 * b=|B| items out of a universe of N, the probability their overlap is at least k by
 * chance. This is the mathematically correct null for "these two accounts co-occur
 * more than coincidence" — an edge is asserted only when this p-value is small.
 */
export function hypergeomTail(k: number, a: number, b: number, N: number): number {
  if (k <= 0) return 1;
  if (a > N || b > N) return NaN;
  const maxK = Math.min(a, b);
  let p = 0;
  const logDenom = logChoose(N, b);
  for (let i = k; i <= maxK; i++) {
    p += Math.exp(logChoose(b, i) + logChoose(N - b, a - i) - logDenom);
  }
  return Math.min(1, Math.max(0, p));
}

export interface CoOccurEdge {
  a: string;
  b: string;
  overlap: number;
  pValue: number;
  significant: boolean;
}

/**
 * One-mode projection of an accounts×items bipartite graph, keeping only edges whose
 * co-occurrence beats the hypergeometric null. `alpha` is the significance threshold.
 */
export function coOccurrenceEdges(
  memberships: Record<string, string[]>,
  alpha = 0.05,
): CoOccurEdge[] {
  const accounts = Object.keys(memberships);
  const sets = new Map<string, Set<string>>();
  const universe = new Set<string>();
  for (const acc of accounts) {
    const s = new Set(memberships[acc]);
    sets.set(acc, s);
    for (const item of s) universe.add(item);
  }
  const N = universe.size;
  const out: CoOccurEdge[] = [];
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const A = sets.get(accounts[i])!;
      const B = sets.get(accounts[j])!;
      let overlap = 0;
      for (const x of A) if (B.has(x)) overlap++;
      if (overlap === 0) continue;
      const p = hypergeomTail(overlap, A.size, B.size, N);
      out.push({ a: accounts[i], b: accounts[j], overlap, pValue: p, significant: p < alpha });
    }
  }
  return out.sort((x, y) => x.pValue - y.pValue);
}

// ---------------------------------------------------------------------------
// Temporal synchrony (activity in lockstep vs a permutation null)
// ---------------------------------------------------------------------------

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sxy += x[i] * y[i];
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
}

export interface SynchronyResult {
  correlation: number;
  pValue: number;
  method: string;
  permutations: number;
}

/**
 * Synchrony between two activity series via Pearson correlation vs a circular-shift
 * permutation null (seeded, so reproducible). p = fraction of shifted correlations
 * >= observed. Returns a high p (not significant) when the two series only look
 * aligned by coincidence.
 */
export function temporalSynchrony(a: number[], b: number[], seed = 1, permutations = 500): SynchronyResult {
  const n = Math.min(a.length, b.length);
  const obs = pearson(a.slice(0, n), b.slice(0, n));
  if (n < 3) return { correlation: obs, pValue: 1, method: "circular-shift-permutation", permutations: 0 };
  const rng = mulberry32(seed);
  let ge = 1; // +1 for the observed (avoids p=0)
  for (let p = 0; p < permutations; p++) {
    const shift = 1 + Math.floor(rng() * (n - 1));
    const bShift = b.slice(0, n).map((_, i) => b[(i + shift) % n]);
    if (pearson(a.slice(0, n), bShift) >= obs) ge++;
  }
  return { correlation: obs, pValue: ge / (permutations + 1), method: "circular-shift-permutation", permutations };
}
