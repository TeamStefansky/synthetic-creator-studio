// Source-network model for the SIGNAL console's NETWORK view. The uploaded
// dashboard built this by asking an LLM to INVENT named actors ("journalists,
// notable accounts", g=1 "verified") and let the user DRILL for more. That
// violates the project rules head-on: no named-individual attribution, no
// fabrication, nodes are accounts/infra never people/actors, and no offensive
// "who is spreading this" targeting.
//
// This lawful version is built ONLY from data already collected:
//   - a node is a real ACCOUNT/OUTLET that actually appears in the mentions
//     (the handle/byline/outlet the source returned), sized by how many
//     mentions carry it - never a person, never an inferred actor,
//   - a community is a narrative THREAD (storyline), not an organization,
//   - an edge is co-membership in the same narrative (a co-behavior signal),
//     rendered as such - never asserted as a real interaction.
// Pure + testable; the force layout runs client-side over this graph.

import type { MapMention, MentionSourceType } from "./mentions-map";
import type { NarrativeThread } from "./signal-narratives";
import { outletId, outletName } from "./signal";
import { clusterNearDuplicates } from "./similarity";
import { coOccurrenceEdges } from "./analysis/graph";
import { benjaminiHochberg } from "./analysis/stats";

export interface NetworkNode {
  id: string;
  /** Account handle / outlet / byline as collected (never a private person). */
  label: string;
  source: string;
  sourceType: MentionSourceType;
  /** Narrative-thread index this account is grouped under (-1 = unclustered). */
  community: number;
  /** Mentions carrying this account (drives node size). */
  count: number;
  /** Mention indices this account is the source of (click -> open in feed). */
  mentions: number[];
}

export interface NetworkEdge {
  /** Node ids. Both kinds are INFERRED co-behavior signals, never an observed
   * interaction (CLAUDE.md: inferred edges are never typed observed). */
  a: string;
  b: string;
  community: number;
  /** "community" = co-membership in a narrative (layout aid).
   *  "coshare"   = statistically VALIDATED co-sharing: the two accounts carried
   *  near-duplicate content more often than the hypergeometric null explains,
   *  after Benjamini-Hochberg FDR control. Still inferred - never observed. */
  kind?: "community" | "coshare";
  /** BH-adjusted q-value (coshare edges only). */
  q?: number;
  /** Shared near-duplicate content items (coshare edges only). */
  overlap?: number;
}

export interface SourceNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  communities: { index: number; name: string }[];
}

const MAX_EDGES_PER_COMMUNITY = 60; // keep the layout legible on big scans

// ---------------------------------------------------------------------------
// Statistically validated co-sharing (bipartite null model + FDR)
// ---------------------------------------------------------------------------

/** BH-adjusted q-value ceiling for a validated co-share edge. */
export const COSHARE_FDR_Q = 0.1;
/** Two accounts must share at least this many distinct content items - one
 * shared item is never evidence of anything. */
export const COSHARE_MIN_OVERLAP = 2;
/** Below this many distinct content items the null model has no room to work
 * and every overlap looks "significant" - report nothing instead (rule 4). */
export const COSHARE_MIN_UNIVERSE = 6;

export interface CoshareEdge {
  a: string; // node ids (outletId)
  b: string;
  overlap: number; // shared near-duplicate content items
  q: number; // BH-adjusted significance
}

/**
 * Validated co-share edges: project the account × content bipartite graph and
 * keep ONLY pairs whose overlap beats the hypergeometric null (chance, given
 * how much each account posts) after Benjamini-Hochberg FDR correction.
 * "Content item" = a near-duplicate text cluster (lib/similarity - unicode-safe),
 * so re-worded copies of one message count as the same item.
 * Deterministic; pure. An edge here is STILL inferred co-behavior - the claim
 * is only "more shared content than chance explains", never "they interacted"
 * and never who is behind the accounts.
 */
export function validatedCoshareEdges(mentions: MapMention[]): CoshareEdge[] {
  // 1. Content items: near-duplicate clusters over the collected texts.
  const withText = mentions
    .map((m, idx) => ({ idx, text: (m.text || "").trim(), account: (m.account || "").trim(), m }))
    .filter((r) => r.text && r.account);
  if (withText.length < 3) return [];
  const dupClusters = clusterNearDuplicates(withText, (r) => r.text);

  // 2. Bipartite memberships: account -> distinct content items it carried.
  const memberships: Record<string, string[]> = {};
  dupClusters.forEach((cluster, itemIdx) => {
    const item = `item:${itemIdx}`;
    for (const r of cluster) {
      const id = outletId(r.m.source, r.account);
      (memberships[id] ??= []).push(item);
    }
  });
  for (const id of Object.keys(memberships)) memberships[id] = [...new Set(memberships[id])];
  if (dupClusters.length < COSHARE_MIN_UNIVERSE) return [];

  // 3. One-mode projection vs the hypergeometric null, then FDR control.
  const raw = coOccurrenceEdges(memberships, 1).filter((e) => e.overlap >= COSHARE_MIN_OVERLAP);
  if (!raw.length) return [];
  const qs = benjaminiHochberg(raw.map((e) => e.pValue));
  return raw
    .map((e, i) => ({ a: e.a, b: e.b, overlap: e.overlap, q: qs[i] }))
    .filter((e) => e.q <= COSHARE_FDR_Q)
    .sort((x, y) => x.q - y.q || y.overlap - x.overlap);
}

/** Which narrative thread owns a given mention index (-1 if none). */
function threadOfMention(threads: NarrativeThread[], idx: number): number {
  for (let i = 0; i < threads.length; i++) if (threads[i].mentions.includes(idx)) return i;
  return -1;
}

/** Build the source network from collected mentions + real narrative threads.
 * Accounts are grouped by the dominant narrative of the mentions that carry
 * them. Edges connect accounts that share a narrative. */
export function buildSourceNetwork(mentions: MapMention[], threads: NarrativeThread[]): SourceNetwork {
  // Accumulate real accounts.
  const nodes = new Map<string, NetworkNode>();
  const communityVotes = new Map<string, Map<number, number>>();

  mentions.forEach((m, idx) => {
    const account = (m.account || "").trim();
    if (!account) return;
    // Surface the OUTLET, never a journalist's name; byline sources collapse
    // into one outlet node (CLAUDE.md rule 1).
    const id = outletId(m.source, account);
    const label = outletName(m.source, account);
    let node = nodes.get(id);
    if (!node) {
      node = { id, label, source: m.source, sourceType: m.sourceType, community: -1, count: 0, mentions: [] };
      nodes.set(id, node);
      communityVotes.set(id, new Map());
    }
    node.count++;
    node.mentions.push(idx);
    const t = threadOfMention(threads, idx);
    if (t >= 0) {
      const votes = communityVotes.get(id)!;
      votes.set(t, (votes.get(t) || 0) + 1);
    }
  });

  // Assign each account to its dominant narrative.
  for (const [id, votes] of communityVotes) {
    let best = -1;
    let bn = 0;
    for (const [t, c] of votes) if (c > bn) { bn = c; best = t; }
    nodes.get(id)!.community = best;
  }

  // Edges: within each community, connect accounts (capped, deterministic).
  const byCommunity = new Map<number, NetworkNode[]>();
  for (const node of nodes.values()) {
    const arr = byCommunity.get(node.community) || [];
    arr.push(node);
    byCommunity.set(node.community, arr);
  }
  const edges: NetworkEdge[] = [];
  for (const [community, arr] of byCommunity) {
    if (community < 0 || arr.length < 2) continue;
    // Sort by count desc so the busiest accounts anchor the cluster.
    const sorted = [...arr].sort((a, b) => b.count - a.count);
    let made = 0;
    // Star from the top account + a light ring, kept under the cap.
    for (let i = 1; i < sorted.length && made < MAX_EDGES_PER_COMMUNITY; i++) {
      edges.push({ a: sorted[0].id, b: sorted[i].id, community, kind: "community" });
      made++;
      if (i > 1 && made < MAX_EDGES_PER_COMMUNITY) {
        edges.push({ a: sorted[i - 1].id, b: sorted[i].id, community, kind: "community" });
        made++;
      }
    }
  }

  // Statistically validated co-share edges (bipartite null + FDR). When a pair
  // already has a decorative community edge, the validated edge UPGRADES it
  // (same pair never drawn twice); otherwise it is added - possibly across
  // communities, which is exactly the interesting case.
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const byPair = new Map<string, NetworkEdge>();
  for (const e of edges) byPair.set(pairKey(e.a, e.b), e);
  for (const v of validatedCoshareEdges(mentions)) {
    const na = nodes.get(v.a);
    const nb = nodes.get(v.b);
    if (!na || !nb) continue;
    const community = na.community === nb.community ? na.community : na.community >= 0 ? na.community : nb.community;
    const existing = byPair.get(pairKey(v.a, v.b));
    if (existing) {
      existing.kind = "coshare";
      existing.q = v.q;
      existing.overlap = v.overlap;
    } else {
      const e: NetworkEdge = { a: v.a, b: v.b, community, kind: "coshare", q: v.q, overlap: v.overlap };
      edges.push(e);
      byPair.set(pairKey(v.a, v.b), e);
    }
  }

  const communities = threads.map((t, i) => ({ index: i, name: t.name }));
  return { nodes: [...nodes.values()], edges, communities };
}
