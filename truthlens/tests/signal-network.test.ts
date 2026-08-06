// Source-network model. Gates: nodes are only REAL accounts collected in the
// mentions (never invented), grouped by their dominant narrative; a mention with
// no account contributes no node; edges connect accounts sharing a narrative and
// carry that community. This is the lawful replacement for the uploaded
// dashboard's "LLM invents named actors" network.

import { describe, it, expect } from "vitest";
import {
  buildSourceNetwork,
  validatedCoshareEdges,
  COSHARE_FDR_Q,
  COSHARE_MIN_OVERLAP,
} from "../lib/signal-network";
import type { MapMention } from "../lib/mentions-map";
import type { NarrativeThread } from "../lib/signal-narratives";

const m = (p: Partial<MapMention>): MapMention =>
  ({ source: "x", id: Math.random().toString(36), text: "t", sourceType: "social", ...p } as MapMention);

describe("buildSourceNetwork", () => {
  const mentions: MapMention[] = [
    m({ source: "reddit", account: "alpha", sourceType: "forum" }), // idx 0
    m({ source: "reddit", account: "alpha", sourceType: "forum" }), // idx 1
    m({ source: "x", account: "beta", sourceType: "social" }),      // idx 2
    m({ source: "x", account: "", sourceType: "social" }),          // idx 3 - no account
    m({ source: "gdelt", account: "cnn.com", sourceType: "news" }), // idx 4
  ];
  const threads: NarrativeThread[] = [
    { name: "Thread A", note: "", mentions: [0, 1, 2] },
    { name: "Thread B", note: "", mentions: [4] },
  ];

  it("builds nodes only from real collected accounts", () => {
    const net = buildSourceNetwork(mentions, threads);
    const labels = net.nodes.map((n) => n.label).sort();
    expect(labels).toEqual(["alpha", "beta", "cnn.com"]);
    // the account-less mention (idx 3) produced no node
    expect(net.nodes.some((n) => !n.label)).toBe(false);
  });

  it("counts mentions per account and assigns the dominant narrative", () => {
    const net = buildSourceNetwork(mentions, threads);
    const alpha = net.nodes.find((n) => n.label === "alpha")!;
    expect(alpha.count).toBe(2);
    expect(alpha.community).toBe(0);
    expect(alpha.mentions).toEqual([0, 1]);
    expect(net.nodes.find((n) => n.label === "cnn.com")!.community).toBe(1);
  });

  it("connects accounts that share a narrative, tagged with that community", () => {
    const net = buildSourceNetwork(mentions, threads);
    // Thread A has alpha + beta -> one edge between them, community 0
    const e = net.edges.find((x) => x.community === 0);
    expect(e).toBeTruthy();
    const ids = [e!.a, e!.b].sort();
    expect(ids).toEqual(["reddit:alpha", "x:beta"]);
    // Thread B has a single account -> no intra-community edge
    expect(net.edges.some((x) => x.community === 1)).toBe(false);
  });

  it("exposes the communities from the threads", () => {
    const net = buildSourceNetwork(mentions, threads);
    expect(net.communities).toEqual([
      { index: 0, name: "Thread A" },
      { index: 1, name: "Thread B" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Statistically validated co-sharing (bipartite hypergeometric null + FDR)
// ---------------------------------------------------------------------------

describe("validatedCoshareEdges", () => {
  // Two accounts repeatedly posting the SAME (near-duplicate) texts, against a
  // universe of many distinct items posted by bystanders.
  const shared = [
    "breaking: the dam has failed and floods the valley tonight",
    "officials confirm the reservoir contract was never signed",
    "exclusive: the mayor's office deleted the audit findings",
  ];
  const noise = [
    "local bakery wins the regional bread award",
    "high school robotics team reaches the national final",
    "city library extends weekend opening hours",
    "farmers market moves to the riverside square",
    "new bike lane opens along the harbor road",
    "museum announces a photography retrospective",
    "transit authority tests electric buses downtown",
    "botanical garden plants a pollinator meadow",
  ];
  const mk = (account: string, text: string, i: number): MapMention =>
    ({ source: "bsky", id: `${account}-${i}`, text, account, sourceType: "social" } as MapMention);

  const mentions: MapMention[] = [
    // accounts A and B co-share all three items (near-duplicates of each other)
    ...shared.map((t, i) => mk("acctA", t, i)),
    ...shared.map((t, i) => mk("acctB", t + " !!", i)), // reworded copies still cluster
    // bystanders each post ONE distinct item
    ...noise.map((t, i) => mk(`by${i}`, t, i)),
    // account C shares only ONE item with A - must never form an edge
    mk("acctC", shared[0] + " ...", 99),
  ];

  it("keeps the pair whose overlap beats the chance null (with q + overlap)", () => {
    const edges = validatedCoshareEdges(mentions);
    const ab = edges.find((e) => [e.a, e.b].sort().join() === "bsky:accta,bsky:acctb");
    expect(ab).toBeTruthy();
    expect(ab!.overlap).toBe(3);
    expect(ab!.q).toBeLessThanOrEqual(COSHARE_FDR_Q);
  });

  it("never edges a single shared item (overlap floor)", () => {
    const edges = validatedCoshareEdges(mentions);
    expect(COSHARE_MIN_OVERLAP).toBeGreaterThanOrEqual(2);
    expect(edges.some((e) => [e.a, e.b].some((id) => id.includes("acctc")))).toBe(false);
    expect(edges.some((e) => [e.a, e.b].some((id) => id.includes("by0")))).toBe(false);
  });

  it("returns [] on a tiny universe instead of fake significance", () => {
    const tiny = [mk("a", "same text here", 0), mk("b", "same text here", 1), mk("a", "other text now", 2), mk("b", "other text now", 3)];
    expect(validatedCoshareEdges(tiny)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(validatedCoshareEdges(mentions))).toBe(JSON.stringify(validatedCoshareEdges(mentions)));
  });

  it("upgrades the pair's edge inside buildSourceNetwork with kind + q", () => {
    const threads: NarrativeThread[] = [{ name: "T", note: "", mentions: mentions.map((_, i) => i) }];
    const net = buildSourceNetwork(mentions, threads);
    const validated = net.edges.filter((e) => e.kind === "coshare");
    expect(validated.length).toBeGreaterThan(0);
    expect(validated[0].q).toBeLessThanOrEqual(COSHARE_FDR_Q);
    // decorative community edges are explicitly typed, never masquerade
    expect(net.edges.every((e) => e.kind === "coshare" || e.kind === "community")).toBe(true);
  });
});
