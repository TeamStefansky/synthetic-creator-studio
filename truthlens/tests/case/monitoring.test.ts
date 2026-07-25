import { describe, it, expect } from "vitest";
import { synthesizeCase } from "../../lib/case/synthesize";
import { monitorDiff } from "../../lib/case/diff";
import { caseShapeHash } from "../../lib/case/shape";
import { classifyMateriality, promoteTierUpgrade, tierAlerts, MATERIALITY_TABLE } from "../../lib/case/materiality";
import { eventTime } from "../../lib/case/adapters/util";
import type { PathInstance } from "../../lib/case/path";

const inst = (id: string, at: string | undefined, tier: any): PathInstance => ({ id, claimId: "c1", entity: id, time: eventTime(at, tier) });

describe("materiality table (04·P1)", () => {
  it("structural / interpretive alert; evidential + cosmetic do not", () => {
    expect(classifyMateriality("cluster_split")).toBe("structural");
    expect(classifyMateriality("confidence_band_change")).toBe("interpretive");
    expect(classifyMateriality("new_evidence")).toBe("evidential");
    expect(classifyMateriality("crawl_time_advanced")).toBe("cosmetic");
    expect(tierAlerts("structural")).toBe(true);
    expect(tierAlerts("evidential")).toBe(false);
    expect(tierAlerts("cosmetic")).toBe(false);
  });
  it("a tier upgrade that enables direction is promoted to structural", () => {
    expect(promoteTierUpgrade(true)).toBe("tier_upgrade_enables_direction");
    expect(classifyMateriality("tier_upgrade_enables_direction")).toBe("structural");
    expect(promoteTierUpgrade(false)).toBe("time_tier_upgrade");
    expect(classifyMateriality("time_tier_upgrade")).toBe("evidential");
  });
});

describe("shape hash + churn gate (04·P1)", () => {
  it("HEADLINE: a churn-only re-run has an identical shape hash and zero diff/alerts", () => {
    const base = { entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" as const }] };
    const runA = synthesizeCase({ ...base, enteredCaseAt: "2026-01-01T00:00:00Z" });
    const runB = synthesizeCase({ ...base, enteredCaseAt: "2026-06-30T23:59:00Z" }); // only the snapshot time churned
    expect(caseShapeHash(runA)).toBe(caseShapeHash(runB));
    const d = monitorDiff(runA, runB, "full");
    expect(d.shapeChanged).toBe(false);
    expect(d.items).toHaveLength(0);
    expect(d.alerts).toHaveLength(0);
  });

  it("a new Moderate+ cluster produces a structural alert", () => {
    const prev = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const next = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const d = monitorDiff(prev, next, "full");
    expect(d.shapeChanged).toBe(true);
    expect(d.items.some((i) => i.kind === "cluster_merge" && i.tier === "structural")).toBe(true);
    expect(d.alerts.length).toBeGreaterThan(0);
  });

  it("direction becoming established is a structural change", () => {
    const prev = synthesizeCase({ entities: ["x"], claimInstances: [inst("p", "2026-01-01T00:00:00Z", "T4"), inst("q", "2026-02-01T00:00:00Z", "T4")], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const next = synthesizeCase({ entities: ["x"], claimInstances: [inst("p", "2026-01-01T00:00:00Z", "T1"), inst("q", "2026-02-01T00:00:00Z", "T1")], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const d = monitorDiff(prev, next, "full");
    expect(d.items.some((i) => i.kind === "direction_established" && i.tier === "structural")).toBe(true);
  });

  it("a confidence downgrade carries a judgmentDelta (previous -> new)", () => {
    const prev = synthesizeCase({ entities: ["a.com", "b.com", "c.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }, { a: "b.com", b: "c.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const next = synthesizeCase({ entities: ["a.com", "b.com", "c.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }, { a: "b.com", b: "c.com", strength: "Medium" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const d = monitorDiff(prev, next, "full");
    const item = d.items.find((i) => i.kind === "confidence_band_change");
    expect(item?.judgmentDelta).toEqual({ field: "cluster_confidence", from: "High", to: "Medium" });
  });
});

describe("partial-coverage retraction guard (04·P1)", () => {
  it("a partial run may not retract a cluster and emits no alert", () => {
    const prev = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const next = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [], enteredCaseAt: "2026-01-01T00:00:00Z" }); // cluster gone
    const d = monitorDiff(prev, next, "partial");
    expect(d.suppressedRemovals).toBeGreaterThan(0);   // the cluster loss was withheld
    expect(d.items.some((i) => i.isRemoval)).toBe(false);
    expect(d.alerts).toHaveLength(0);                   // no regression alert from a partial run
  });

  it("a FULL run may retract the same cluster (cluster_split, structural)", () => {
    const prev = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const next = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const d = monitorDiff(prev, next, "full");
    expect(d.items.some((i) => i.kind === "cluster_split")).toBe(true);
  });
});
