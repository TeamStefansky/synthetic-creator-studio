// Source-network model. Gates: nodes are only REAL accounts collected in the
// mentions (never invented), grouped by their dominant narrative; a mention with
// no account contributes no node; edges connect accounts sharing a narrative and
// carry that community. This is the lawful replacement for the uploaded
// dashboard's "LLM invents named actors" network.

import { describe, it, expect } from "vitest";
import { buildSourceNetwork } from "../lib/signal-network";
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
