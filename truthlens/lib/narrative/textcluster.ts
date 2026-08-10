// Deterministic narrative clustering - TF-IDF + cosine, no model in the loop.
//
// The SIGNAL narrative layer previously asked the LLM to both GROUP and LABEL
// mentions, which made the grouping itself non-reproducible (rule 8: a report
// for a given day must be reproducible). This module moves the grouping into
// pure, deterministic TypeScript: identical input → identical clusters, every
// run, with no API key. The LLM's only remaining job is naming a cluster that
// already exists (and even that degrades to keyword labels).
//
// Method: unicode-safe normalize (ONE normalizeText, lib/similarity) → TF-IDF
// vectors → greedy centroid agglomerative clustering with a named threshold →
// one merge pass. Scores are computed in TypeScript, never by the model.

import { normalizeText } from "@/lib/similarity";

export const TEXTCLUSTER_VERSION = "textcluster-v1";

/** Cosine similarity a text must reach against a cluster centroid to join it.
 * Topic-level (lower than the 0.72 near-duplicate Jaccard - these are
 * storylines, not copies). */
export const NARRATIVE_COSINE_THRESHOLD = 0.22;

/** A storyline needs at least this many posts; singletons stay unclustered. */
export const MIN_CLUSTER_SIZE = 2;

/** Tokens shorter than this carry no topical signal. */
const MIN_TOKEN_LEN = 2;

export type Vec = Map<string, number>;

/** Unicode-safe tokens for one text (any script; URLs already stripped). */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}

/** L2-normalized TF-IDF vectors for a corpus. Deterministic (insertion order). */
export function tfidfVectors(texts: string[]): Vec[] {
  const docs = texts.map(tokenize);
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) || 0) + 1);
  }
  const N = docs.length;
  return docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) || 0) + 1);
    const vec: Vec = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (c / doc.length) * Math.log(1 + N / (df.get(t) || 1));
      vec.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  });
}

/** Cosine of two L2-normalized sparse vectors. */
export function cosine(a: Vec, b: Vec): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [t, w] of small) {
    const v = big.get(t);
    if (v) s += w * v;
  }
  return s;
}

interface Cluster {
  members: number[]; // indices into the input texts
  centroid: Vec; // running mean of member vectors (re-normalized)
}

function addToCentroid(c: Cluster, v: Vec) {
  const n = c.members.length; // AFTER push
  let norm = 0;
  const next: Vec = new Map();
  for (const [t, w] of c.centroid) next.set(t, (w * (n - 1)) / n);
  for (const [t, w] of v) next.set(t, (next.get(t) || 0) + w / n);
  for (const w of next.values()) norm += w * w;
  norm = Math.sqrt(norm) || 1;
  c.centroid = new Map([...next].map(([t, w]) => [t, w / norm]));
}

/**
 * Greedy centroid clustering + one deterministic merge pass. Returns clusters
 * of input indices, largest first (ties: earliest first member). Only clusters
 * with ≥ MIN_CLUSTER_SIZE members are returned; the rest are unclustered -
 * never force-fit (rule 4).
 */
export function clusterTexts(texts: string[], threshold = NARRATIVE_COSINE_THRESHOLD): number[][] {
  const vecs = tfidfVectors(texts);
  const clusters: Cluster[] = [];
  vecs.forEach((v, i) => {
    if (v.size === 0) return; // no tokens → cannot cluster, stays out
    let best = -1;
    let bs = threshold;
    for (let c = 0; c < clusters.length; c++) {
      const s = cosine(v, clusters[c].centroid);
      if (s > bs) { bs = s; best = c; }
    }
    if (best >= 0) {
      clusters[best].members.push(i);
      addToCentroid(clusters[best], v);
    } else {
      clusters.push({ members: [i], centroid: new Map(v) });
    }
  });

  // One merge pass: greedy order, earliest pair first - deterministic.
  for (let i = 0; i < clusters.length; i++) {
    for (let j = clusters.length - 1; j > i; j--) {
      if (cosine(clusters[i].centroid, clusters[j].centroid) >= threshold) {
        for (const m of clusters[j].members) {
          clusters[i].members.push(m);
          addToCentroid(clusters[i], vecs[m]);
        }
        clusters.splice(j, 1);
      }
    }
  }

  return clusters
    .filter((c) => c.members.length >= MIN_CLUSTER_SIZE)
    .map((c) => ({ ...c, members: [...c.members].sort((a, b) => a - b) }))
    .sort((a, b) => b.members.length - a.members.length || a.members[0] - b.members[0])
    .map((c) => c.members);
}

/** Top-k highest-TF-IDF terms across a cluster - the mechanical keyword label
 * used when no LLM is connected (real computation, clearly mechanical). */
export function topTerms(texts: string[], members: number[], k = 3): string[] {
  const vecs = tfidfVectors(texts);
  const sum = new Map<string, number>();
  for (const m of members) {
    for (const [t, w] of vecs[m] || []) sum.set(t, (sum.get(t) || 0) + w);
  }
  return [...sum.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k)
    .map(([t]) => t);
}
