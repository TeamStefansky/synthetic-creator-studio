// Claim identity (layer 03 · P2). Two texts are the same claim if they are
// near-duplicates (same-language paraphrase, via lib/similarity) OR they share a
// distinctive anchor set — numbers, URLs, domains, @handles, #tags, and Latin
// proper-noun tokens — which survive translation. This gives deterministic,
// translation-robust claim clustering WITHOUT calling the model: cross-language
// restatements that share an entity or figure land together. True semantic
// translation matching is an optional LLM enhancement (deferred), never faked.

import { clusterNearDuplicates } from "@/lib/similarity";

export const ANCHOR_JACCARD_THRESHOLD = 0.34; // share ~a third of anchors => same claim

const URL_RE = /https?:\/\/[^\s"'<>)]+/gi;
const DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi;
const NUM_RE = /\b\d[\d,.]{1,}\b/g;                 // figures, dates, counts
const HANDLE_RE = /[@#][A-Za-z0-9_֐-׿]{2,}/g;
const PROPER_RE = /\b[A-Z][a-zA-Z]{2,}\b/g;         // Latin proper nouns (survive as loanwords)

/** Distinctive, language-independent anchors extracted from a claim. */
export function claimAnchors(text: string): Set<string> {
  const t = text || "";
  const a = new Set<string>();
  for (const m of t.match(URL_RE) || []) a.add(`u:${m.toLowerCase()}`);
  for (const m of t.match(DOMAIN_RE) || []) if (m.includes(".")) a.add(`d:${m.toLowerCase()}`);
  for (const m of t.match(NUM_RE) || []) a.add(`n:${m.replace(/[.,]/g, "")}`);
  for (const m of t.match(HANDLE_RE) || []) a.add(`h:${m.toLowerCase()}`);
  for (const m of t.match(PROPER_RE) || []) a.add(`p:${m.toLowerCase()}`);
  return a;
}

function anchorJaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface ClaimCluster<T> { representative: T; members: T[] }

/**
 * Cluster items by claim identity. Starts from same-language near-duplicate
 * clusters, then merges clusters whose representatives share enough anchors
 * (translation-robust). Pure and deterministic.
 */
export function clusterClaims<T>(items: T[], getText: (t: T) => string): ClaimCluster<T>[] {
  const base = clusterNearDuplicates(items, getText);
  const clusters = base.map((members) => ({ members: [...members], anchors: claimAnchors(getText(members[0])) }));
  // Union clusters that share anchors (single pass, deterministic order).
  const merged: { members: T[]; anchors: Set<string> }[] = [];
  for (const c of clusters) {
    const hit = merged.find((m) => anchorJaccard(m.anchors, c.anchors) >= ANCHOR_JACCARD_THRESHOLD);
    if (hit) { hit.members.push(...c.members); for (const x of c.anchors) hit.anchors.add(x); }
    else merged.push({ members: [...c.members], anchors: new Set(c.anchors) });
  }
  return merged.map((m) => ({ representative: m.members[0], members: m.members }));
}
