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
  /** Node ids. Co-membership in a narrative - a co-behavior signal, not an
   * observed interaction (CLAUDE.md: inferred edges are never typed observed). */
  a: string;
  b: string;
  community: number;
}

export interface SourceNetwork {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  communities: { index: number; name: string }[];
}

const MAX_EDGES_PER_COMMUNITY = 60; // keep the layout legible on big scans

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
      edges.push({ a: sorted[0].id, b: sorted[i].id, community });
      made++;
      if (i > 1 && made < MAX_EDGES_PER_COMMUNITY) {
        edges.push({ a: sorted[i - 1].id, b: sorted[i].id, community });
        made++;
      }
    }
  }

  const communities = threads.map((t, i) => ({ index: i, name: t.name }));
  return { nodes: [...nodes.values()], edges, communities };
}
