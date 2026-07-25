import { describe, it, expect } from "vitest";
import { declareIndicator, nonFiringOutcome, firedAlert, MAX_INDICATOR_FPR, type Indicator } from "../../lib/case/indicators";
import { consolidateSinceReview, queueCandidate, caseEntities, acceptCandidate, buildDigest, type Candidate, type RunRecord } from "../../lib/case/review";
import type { MonitorDiffItem } from "../../lib/case/diff";

const indicator = (fpr: number): Indicator => ({
  id: "ind1", hypothesisId: "same_operator", description: "a shared AdSense id appears on both", observableArtifact: "adsense_id",
  collectionPath: "page HTML", direction: "supports", expectedFalsePositiveRate: fpr, declaredAt: "2026-01-01T00:00:00Z",
});

describe("indicators declared in advance (04·P5)", () => {
  it("a high-false-positive indicator is rejected at declaration", () => {
    expect(declareIndicator(indicator(0.1)).ok).toBe(true);
    expect(declareIndicator(indicator(MAX_INDICATOR_FPR + 0.1)).ok).toBe(false);
  });
  it("a fired indicator alerts Structural and names its hypothesis + direction", () => {
    expect(firedAlert(indicator(0.1))).toMatch(/structural.*supports.*same_operator/);
  });
  it("a non-firing indicator is negative evidence under full coverage, a gap under partial, pending before the window", () => {
    expect(nonFiringOutcome({ windowElapsed: true, coverage: "full" })).toBe("negative_evidence");
    expect(nonFiringOutcome({ windowElapsed: true, coverage: "partial" })).toBe("gap");
    expect(nonFiringOutcome({ windowElapsed: false, coverage: "full" })).toBe("pending");
  });
});

describe("review consolidation (04·P5)", () => {
  it("consolidates runs since the last reviewed shape, newest per subject", () => {
    const mk = (kind: any, subjectKey: string): MonitorDiffItem => ({ kind, tier: "structural", subjectKey, isRemoval: false, alerts: true });
    const runs: RunRecord[] = [
      { shapeHash: "h0", at: "d0", items: [mk("cluster_merge", "old")] },     // reviewed at h0
      { shapeHash: "h1", at: "d1", items: [mk("cluster_merge", "a|b")] },
      { shapeHash: "h2", at: "d2", items: [mk("confidence_band_change", "a|b")] },
    ];
    const consolidated = consolidateSinceReview(runs, "h0");
    // h0 excluded; a|b appears once (latest = confidence_band_change)
    expect(consolidated.find((i) => i.subjectKey === "old")).toBeUndefined();
    expect(consolidated.filter((i) => i.subjectKey === "a|b")).toHaveLength(1);
    expect(consolidated.find((i) => i.subjectKey === "a|b")!.kind).toBe("confidence_band_change");
  });
});

describe("candidate queue — no automatic expansion (04·P5 ethics)", () => {
  it("a discovered entity enters the queue only and never the case until accepted", () => {
    const original = ["a.com", "b.com"];
    let queue: Candidate[] = [];
    queue = queueCandidate(queue, { entity: "c.com", linkedTo: "a.com", strength: "High", evidence: "shared GA id", discoveredAt: "2026-02-01T00:00:00Z" });
    expect(caseEntities(original, queue)).toEqual(["a.com", "b.com"]); // case UNCHANGED
    queue = acceptCandidate(queue, "c.com");                            // explicit acceptance
    expect(caseEntities(original, queue)).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("digest carries everything below the alerting bar without hiding it", () => {
    const evidential: MonitorDiffItem = { kind: "new_evidence", tier: "evidential", subjectKey: "x", isRemoval: false, alerts: false };
    const alerting: MonitorDiffItem = { kind: "cluster_merge", tier: "structural", subjectKey: "y", isRemoval: false, alerts: true };
    const d = buildDigest([evidential, alerting], [{ entity: "c.com", linkedTo: "a.com", strength: "High", evidence: "e", discoveredAt: "t" }], ["a|b flaps"], 2);
    expect(d.evidential.map((i) => i.subjectKey)).toEqual(["x"]); // only below-bar items
    expect(d.candidates).toHaveLength(1);
    expect(d.partialRuns).toBe(2);
  });
});
