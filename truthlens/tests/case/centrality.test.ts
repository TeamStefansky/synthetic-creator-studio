import { describe, it, expect } from "vitest";
import { betweennessCentrality } from "../../lib/case/graph";
import { dropReason, type RawStatement, type ValidationCtx } from "../../lib/case/narrate";
import { buildSitrep } from "../../lib/agent/sitrep";
import { synthesizeCase } from "../../lib/case/synthesize";
import { runAdversary } from "../../lib/agent/adversary";
import { assessDeception } from "../../lib/case/deception";
import type { RunRecord } from "../../lib/agent/types";

describe("betweenness centrality (06·P7)", () => {
  it("a broker (the middle of a chain) has the highest betweenness", () => {
    const cb = betweennessCentrality(["a", "b", "c"], [{ a: "a", b: "b" }, { a: "b", b: "c" }]);
    expect(cb.b).toBeGreaterThan(cb.a);
    expect(cb.b).toBeGreaterThan(cb.c);
  });
  it("a star centre brokers all pairs", () => {
    const cb = betweennessCentrality(["hub", "x", "y", "z"], [{ a: "hub", b: "x" }, { a: "hub", b: "y" }, { a: "hub", b: "z" }]);
    expect(cb.hub).toBeGreaterThan(0);
    expect(cb.x).toBe(0);
  });
});

describe("centrality boundary validator (06·P7)", () => {
  const ctx: ValidationCtx = { validEvidenceIds: new Set(["e1"]), observedEvidenceIds: new Set(["e1"]), establishedOrderings: new Set(), deceptionComplete: false };
  it("a centrality claim without its collection boundary is dropped", () => {
    const s: RawStatement = { text: "b.com is the central broker of the network", label: "INFERENCE", evidenceIds: ["e1"], rung: "association" };
    expect(dropReason(s, ctx)).toMatch(/centrality claim without its collection boundary/);
    expect(dropReason({ ...s, centralityBoundary: "seed=[a,b,c], hop=1" }, ctx)).toBeNull();
  });
});

describe("sitrep surfaces method reliability + premortem + conception (06·P7)", () => {
  it("renders the measured FPR and premortem sections", () => {
    const cf = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High", characteristic: "individual", evidenceId: "ga" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const record: RunRecord = { id: "r", policyVersion: "v", initiator: "a@x", scope: "ws", question: "?", seedEntities: ["a.com", "b.com"], ceiling: "association", status: "complete", coverage: "full", startedAt: "t", cycles: 1 };
    const s = buildSitrep({ record, caseFile: cf, adversary: runAdversary({ ach: cf.ach, deception: assessDeception({}) }), notPursued: [], measuredFpr: 0, fixtureSuiteVersion: "fixtures-v1", premortem: ["SPECULATION: assume it was wrong"], conceptionWarning: "" });
    expect(s.sections["METHOD RELIABILITY"]).toMatch(/measured false-positive rate/);
    expect(s.sections["THE PREMORTEM"]).toMatch(/assume it was wrong/);
    expect(s.sections["CONCEPTION WATCH"]).toMatch(/no conception warning/);
  });
});
