// [4] Influence-Network Map — P1 (builder). Verify per the prompt: observed vs
// inferred edges are correctly typed; a co-behavior-only fixture produces ONLY
// inferred edges (never an observed interaction); NO edge exists without evidence
// + alternative; the builder is deterministic and makes no network calls; too
// little data → insufficient. Nodes are accounts/domains — never people/actors.

import { describe, it, expect } from "vitest";
import { buildNetworkMap } from "../lib/social-analyze/network-map";
import type { Mention } from "../lib/narrative/types";
import type { ProfileSnapshot } from "../lib/social/types";

const T0 = Date.UTC(2024, 2, 1, 12, 0, 0);
const MIN = 60_000;

function mk(account: string, text: string, tMs: number, extra: Partial<Mention> = {}): Mention {
  return { source: "bluesky", id: `${account}-${tMs}-${text.slice(0, 6)}`, text, account, accountId: account,
    timestamp: new Date(tMs).toISOString(), ...extra };
}
const snap = (handle: string, extra: Partial<ProfileSnapshot> = {}): ProfileSnapshot => ({
  platform: "bluesky", handle, connected: true, collectedAt: new Date(T0).toISOString(), ...extra,
});

const PUSH = "the ministry secretly diverted the disaster relief funds to private contractors";

describe("buildNetworkMap — edge typing", () => {
  it("co-behavior-only fixture (no citations) → ONLY inferred edges", () => {
    const mentions = [
      mk("a1", PUSH, T0), mk("a2", PUSH, T0 + MIN), mk("a3", PUSH, T0 + 2 * MIN),
    ];
    const g = buildNetworkMap({ mentions });
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.edges.every((e) => e.evidence!.mode === "inferred")).toBe(true);
    expect(g.observedEdgeKinds).toEqual([]);
    // identical content across 3 accounts is present.
    expect(g.edges.some((e) => e.evidence!.kind === "identical-content")).toBe(true);
  });

  it("a cited domain URL yields an OBSERVED co-citation edge, typed observed", () => {
    const mentions = [
      mk("a1", PUSH, T0, { url: "https://propsite.example/story", account: "a1" }),
      mk("a2", PUSH, T0 + MIN),
    ];
    const g = buildNetworkMap({ mentions });
    const obs = g.edges.filter((e) => e.evidence!.mode === "observed");
    expect(obs.length).toBeGreaterThanOrEqual(1);
    expect(obs.every((e) => e.evidence!.kind === "co-citation")).toBe(true);
    expect(g.observedEdgeKinds).toContain("co-citation");
    // The domain became a node; accounts became account nodes.
    expect(g.nodes.some((n) => n.kind === "domain" && n.label === "propsite.example")).toBe(true);
    expect(g.nodes.filter((n) => n.kind === "account").length).toBe(2);
  });

  it("EVERY edge carries evidence with signals + a non-empty alternative + confidence", () => {
    const mentions = [
      mk("a1", PUSH, T0, { url: "https://x.example/a" }),
      mk("a2", PUSH, T0 + MIN), mk("a3", PUSH, T0 + 2 * MIN),
    ];
    for (const e of buildNetworkMap({ mentions }).edges) {
      expect(e.evidence).toBeDefined();
      expect(Array.isArray(e.evidence!.signals)).toBe(true);
      expect(e.evidence!.signals.length).toBeGreaterThan(0);
      expect(e.evidence!.alternative.length).toBeGreaterThan(0);
      expect(["Low", "Medium", "High"]).toContain(e.evidence!.confidence);
    }
  });

  it("synchronized-timing needs repeated co-posting; a single shared moment doesn't create it", () => {
    // Distinct content (no identical-content edges), each account posts 4× in lockstep.
    const mentions: Mention[] = [];
    for (let k = 0; k < 4; k++) {
      mentions.push(mk("twinA", `distinct message alpha number ${k} here`, T0 + k * 120 * MIN));
      mentions.push(mk("twinB", `distinct message beta number ${k} here`, T0 + k * 120 * MIN + MIN));
      // solo posts 60 min away from both twins in every cycle → never inside the window.
      mentions.push(mk("solo", `a lone unrelated thought ${k}`, T0 + k * 120 * MIN + 60 * MIN));
    }
    const g = buildNetworkMap({ mentions });
    const timing = g.edges.filter((e) => e.evidence!.kind === "synchronized-timing");
    expect(timing.length).toBe(1); // only the A–B pair
    const pair = [timing[0].source, timing[0].target].sort();
    expect(pair).toEqual(["twinA", "twinB"]);
  });

  it("shared avatar file + identical bio → inferred edges (only with collected profiles)", () => {
    const mentions = [
      mk("b1", "totally different post one about the weather today", T0),
      mk("b2", "an entirely unrelated note about lunch plans", T0 + MIN),
    ];
    const profiles = {
      b1: snap("b1", { avatarHash: "deadbeef".repeat(8), bio: "citizen journalist for truth daily" }),
      b2: snap("b2", { avatarHash: "deadbeef".repeat(8), bio: "citizen journalist for truth daily" }),
    };
    const g = buildNetworkMap({ mentions, profiles });
    expect(g.edges.some((e) => e.evidence!.kind === "shared-avatar")).toBe(true);
    expect(g.edges.some((e) => e.evidence!.kind === "identical-bio")).toBe(true);
    expect(g.edges.every((e) => e.evidence!.mode === "inferred")).toBe(true);
  });
});

describe("buildNetworkMap — influence, determinism, insufficiency, ethics", () => {
  it("influence is 0–1, higher for the more-echoed / higher-engagement account", () => {
    const mentions = [
      ...[0, 1, 2, 3].map((k) => mk("hub", PUSH, T0 + k * MIN, { engagement: 500 })),
      mk("a2", PUSH, T0 + 5 * MIN, { engagement: 1 }),
      mk("a3", PUSH, T0 + 6 * MIN, { engagement: 1 }),
      mk("lonely", "a distinct quiet post about nothing much", T0 + 9 * MIN, { engagement: 0 }),
    ];
    const g = buildNetworkMap({ mentions });
    const inf = (id: string) => g.nodes.find((n) => n.id === id)!.influence!;
    for (const n of g.nodes.filter((x) => x.kind === "account")) {
      expect(n.influence!).toBeGreaterThanOrEqual(0);
      expect(n.influence!).toBeLessThanOrEqual(1);
    }
    expect(inf("hub")).toBeGreaterThan(inf("lonely"));
  });

  it("is deterministic: same input → identical nodes and edges", () => {
    const mentions = [
      mk("a1", PUSH, T0, { url: "https://x.example/a" }),
      mk("a2", PUSH, T0 + MIN), mk("a3", PUSH, T0 + 2 * MIN),
    ];
    expect(JSON.stringify(buildNetworkMap({ mentions }))).toBe(JSON.stringify(buildNetworkMap({ mentions })));
  });

  it("too few nodes/edges → insufficient:true with a note, not a misleading graph", () => {
    const g = buildNetworkMap({ mentions: [mk("only", "a single lonely post here", T0)] });
    expect(g.insufficient).toBe(true);
    expect(g.note).toMatch(/insufficient data/i);
  });

  it("ethics: no node/edge carries a person/actor/operator label", () => {
    const mentions = [
      mk("a1", PUSH, T0, { url: "https://x.example/a" }),
      mk("a2", PUSH, T0 + MIN), mk("a3", PUSH, T0 + 2 * MIN),
    ];
    const j = JSON.stringify(buildNetworkMap({ mentions })).toLowerCase();
    for (const banned of ['"person"', '"actor"', '"operator"', '"realname"']) expect(j).not.toContain(banned);
    // Node kinds are only account/domain (no person kind).
    for (const n of buildNetworkMap({ mentions }).nodes) {
      expect(["account", "domain"]).toContain(n.kind);
    }
  });
});
