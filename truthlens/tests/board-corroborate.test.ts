import { describe, it, expect } from "vitest";
import { prevalenceBand } from "@/lib/board/prevalence";
import type { PrevalenceResult } from "@/lib/board/prevalence";
import { classifyGaId } from "@/lib/trackers";
import { applyCorroboration, buildCorroboration, CORROBORATION_VERSION } from "@/lib/board/corroborate";
import type { BoardResult, OverlapItem, PairEdge } from "@/lib/board/types";

const prev = (band: PrevalenceResult["band"], count: number | null): PrevalenceResult => ({
  connected: band !== "unknown",
  count,
  band,
  note: "",
});

describe("prevalenceBand", () => {
  it("maps counts to bands (the reverse-lookup calibrator)", () => {
    expect(prevalenceBand(2)).toBe("unique-pair");
    expect(prevalenceBand(5)).toBe("few");
    expect(prevalenceBand(30)).toBe("many");
    expect(prevalenceBand(500)).toBe("ubiquitous");
    expect(prevalenceBand(null)).toBe("unknown");
  });
});

describe("classifyGaId (recency)", () => {
  it("flags Universal Analytics UA- as deprecated", () => {
    const ua = classifyGaId("UA-23181380-2");
    expect(ua.family).toBe("universal");
    expect(ua.deprecated).toBe(true);
    expect(ua.note).toMatch(/2023/);
  });
  it("treats GA4 and Google Tag ids as current", () => {
    expect(classifyGaId("G-ABC123XYZ").deprecated).toBe(false);
    expect(classifyGaId("GT-ABC123").family).toBe("gtag");
  });
});

describe("applyCorroboration (down-only)", () => {
  it("collapses a ubiquitous id to Low", () => {
    expect(applyCorroboration("High", prev("ubiquitous", 500), false).effective).toBe("Low");
  });
  it("caps an unmeasured (not connected) id at Medium - cannot claim High without prevalence", () => {
    const r = applyCorroboration("High", prev("unknown", null), false);
    expect(r.effective).toBe("Medium");
    expect(r.notes.join(" ")).toMatch(/not measured/i);
  });
  it("keeps High when the id is carried by only the compared pair", () => {
    expect(applyCorroboration("High", prev("unique-pair", 2), false).effective).toBe("High");
  });
  it("a deprecated UA tag caps even a unique-pair overlap at Medium", () => {
    expect(applyCorroboration("High", prev("unique-pair", 2), true).effective).toBe("Medium");
  });
  it("never raises strength above the base", () => {
    expect(applyCorroboration("Low", prev("unique-pair", 2), false).effective).toBe("Low");
  });
});

function edgeWith(item: OverlapItem): PairEdge {
  return { a: "a.com", b: "b.com", strength: item.strength, overlapCount: 1, top: item, items: [item] };
}
function board(edges: PairEdge[]): BoardResult {
  return {
    entities: ["a.com", "b.com"],
    edges,
    network: { nodes: [], edges: [] },
    matrix: [],
    rubricVersion: "test",
    generatedAt: "2026-01-01",
    sources: [],
    fingerprints: [],
  };
}
const uaOverlap: OverlapItem = {
  kind: "ga_id",
  value: "UA-23181380-2",
  display: "UA-23181380-2",
  tier: "strong",
  strength: "High",
  countsToward: true,
  commonness: null,
  alternative: "agencies can reuse an ID",
  source: "HTML",
};

describe("buildCorroboration overlay", () => {
  it("caps a deprecated shared UA id and reports honest not-connected prevalence", async () => {
    const c = await buildCorroboration(board([edgeWith(uaOverlap)]), {
      measure: async () => prev("unknown", null),
    });
    expect(c.version).toBe(CORROBORATION_VERSION);
    expect(c.prevalenceConnected).toBe(false);
    expect(c.artifacts).toHaveLength(1);
    // UA + unmeasured prevalence -> capped from High to Medium.
    expect(c.artifacts[0].baseStrength).toBe("High");
    expect(c.artifacts[0].effectiveStrength).toBe("Medium");
    expect(c.artifacts[0].deprecated).toBeTruthy();
    expect(c.control.distinctiveOverlapCount).toBe(1);
    expect(c.control.probabilityByChance).toBeGreaterThan(0);
    expect(c.nullHypothesis.ifLinked).toMatch(/account-scoped/);
    expect(c.notScanned.length).toBeGreaterThanOrEqual(3);
  });

  it("collapses a ubiquitous shared id to Low when reverse-lookup is connected", async () => {
    const c = await buildCorroboration(board([edgeWith(uaOverlap)]), {
      measure: async () => prev("ubiquitous", 800),
    });
    expect(c.artifacts[0].effectiveStrength).toBe("Low");
    expect(c.artifacts[0].notes.join(" ")).toMatch(/agency|template|meaningless/i);
  });

  it("reports no distinctive ids honestly when there are none", async () => {
    const c = await buildCorroboration(board([]));
    expect(c.artifacts).toHaveLength(0);
    expect(c.summary).toMatch(/No account-scoped/i);
    expect(c.notScanned.length).toBeGreaterThanOrEqual(3);
  });
});
