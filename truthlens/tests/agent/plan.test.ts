import { describe, it, expect } from "vitest";
import { planCollection, scoreDiagnosticity, DISCRIMINATION } from "../../lib/agent/plan";

describe("planning by expected diagnosticity (05·P2)", () => {
  it("a task that separates hypotheses outranks a richer task consistent with all", () => {
    const individualizing = scoreDiagnosticity({ kind: "predicted_artifact", expectedArtifact: "ga_id", estCost: 0.3, probSuccess: 0.5 });
    const classOnly = scoreDiagnosticity({ kind: "predicted_artifact", expectedArtifact: "asn", estCost: 0.1, probSuccess: 0.9 }); // cheaper + likelier, but discriminates nothing
    expect(classOnly).toBe(0);
    expect(individualizing).toBeGreaterThan(classOnly);
  });

  it("an archive lookup that would establish an ordering (T4->T2) ranks at the very top", () => {
    const plan = planCollection({
      liveHypotheses: ["same_operator"],
      entitiesAtT4: ["b.com"],
      unverifiedHashes: ["h1"],
      entities: ["a.com", "b.com"],
    });
    expect(plan[0].kind).toBe("archive_lookup");
    expect(plan[0].enablesOrdering).toBe(true);
    expect(plan[0].reason).toMatch(/establish an ordering/);
  });

  it("class-only artifacts score zero (evidence consistent with every hypothesis)", () => {
    expect(DISCRIMINATION.asn).toBe(0);
    expect(DISCRIMINATION.registrar).toBe(0);
  });

  it("every task carries its diagnosticity and the reason it was chosen or skipped", () => {
    const plan = planCollection({ liveHypotheses: ["same_operator"], entitiesAtT4: [], unverifiedHashes: [], entities: ["a.com"] });
    expect(plan.length).toBeGreaterThan(0);
    for (const t of plan) { expect(typeof t.diagnosticity).toBe("number"); expect(t.reason.length).toBeGreaterThan(0); }
    // sorted descending
    for (let i = 1; i < plan.length; i++) expect(plan[i - 1].diagnosticity).toBeGreaterThanOrEqual(plan[i].diagnosticity);
  });
});
