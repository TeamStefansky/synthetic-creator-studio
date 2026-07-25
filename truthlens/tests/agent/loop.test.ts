import { describe, it, expect } from "vitest";
import { runInvestigation, type Collector } from "../../lib/agent/loop";
import { evaluateStop, DIAGNOSTICITY_FLOOR, NO_PROGRESS_CYCLES } from "../../lib/agent/stop";
import { ZERO_SPEND, MAX_EXTERNAL_CALLS } from "../../lib/agent/budget";
import type { RunInit } from "../../lib/agent/types";
import type { StrengthEdge } from "../../lib/case/cluster";

const init: RunInit = { initiator: "a@x", scope: "ws1", question: "linked?", seedEntities: ["a.com", "b.com"], ceiling: "association" };
const noKill = { stopped: () => false };
let clock = 0;
const now = () => `2026-01-01T00:00:${String(clock++).padStart(2, "0")}Z`;

describe("stopping rule (05·P3)", () => {
  const base = { kill: noKill, spend: ZERO_SPEND, remainingDiagnosticity: 1, achHistory: [] as string[][], noProgressCount: 0 };
  it("each condition fires and is named", () => {
    expect(evaluateStop({ ...base, kill: { stopped: () => true } }).condition).toBe("kill_switch");
    expect(evaluateStop({ ...base, spend: { ...ZERO_SPEND, externalCalls: MAX_EXTERNAL_CALLS } }).condition).toBe("budget");
    expect(evaluateStop({ ...base, noProgressCount: NO_PROGRESS_CYCLES }).condition).toBe("no_progress");
    expect(evaluateStop({ ...base, atCeiling: true }).condition).toBe("ceiling");
    expect(evaluateStop({ ...base, remainingDiagnosticity: DIAGNOSTICITY_FLOOR - 0.01 }).condition).toBe("diminishing_diagnosticity");
    expect(evaluateStop({ ...base, achHistory: [["a"], ["a"]] }).condition).toBe("stability");
    expect(evaluateStop(base).stop).toBe(false);
  });
});

describe("investigator run loop (05·P3)", () => {
  it("HEADLINE null-result: unrelated entities => no case, stops on diminishing diagnosticity, no alert", () => {
    const collector: Collector = () => ({ boardEdges: [], entitiesCollected: 2, spend: { externalCalls: 2 }, remainingDiagnosticity: 0.05 });
    const r = runInvestigation(init, { collector, kill: noKill, now, entitiesPlanned: 2 });
    expect(r.record.status).toBe("complete");
    expect(r.record.stopCondition).toBe("diminishing_diagnosticity");
    expect(r.caseFile.clusters.filter((c) => c.members.length > 1)).toHaveLength(0);
    expect(r.caseFile.bottomLine.likelihood).toBe("n/a"); // "no case established" — a successful run
  });

  it("hypotheses are formed BEFORE the first collection (journal order)", () => {
    const collector: Collector = () => ({ boardEdges: [], entitiesCollected: 2, spend: {}, remainingDiagnosticity: 0.05 });
    const r = runInvestigation(init, { collector, kill: noKill, now, entitiesPlanned: 2 });
    const hypIdx = r.journal.entries.findIndex((e) => e.type === "hypotheses_formed");
    const firstCollect = r.journal.entries.findIndex((e) => e.type === "collection");
    expect(hypIdx).toBeGreaterThanOrEqual(0);
    expect(hypIdx).toBeLessThan(firstCollect);
  });

  it("determinism: different collection ORDER, same final edges => identical conclusions", () => {
    const eAB: StrengthEdge = { a: "a.com", b: "b.com", strength: "High", evidenceId: "ga" };
    const eBC: StrengthEdge = { a: "b.com", b: "c.com", strength: "Medium", evidenceId: "ip" };
    // keep collecting through cycle 2 (high remaining on cycle 1) so both runs reach the SAME final ledger
    const order1: Collector = (c) => (c === 1 ? { boardEdges: [eAB], entitiesCollected: 3, spend: {}, remainingDiagnosticity: 0.5 } : { boardEdges: [eBC], entitiesCollected: 3, spend: {}, remainingDiagnosticity: 0.05 });
    const order2: Collector = (c) => (c === 1 ? { boardEdges: [eBC], entitiesCollected: 3, spend: {}, remainingDiagnosticity: 0.5 } : { boardEdges: [eAB], entitiesCollected: 3, spend: {}, remainingDiagnosticity: 0.05 });
    const init3 = { ...init, seedEntities: ["a.com", "b.com", "c.com"] };
    clock = 0; const r1 = runInvestigation(init3, { collector: order1, kill: noKill, now, entitiesPlanned: 3 });
    clock = 0; const r2 = runInvestigation(init3, { collector: order2, kill: noKill, now, entitiesPlanned: 3 });
    // conclusions (ACH + bottom line + clusters) identical regardless of collection order
    expect(JSON.stringify(r1.caseFile.ach.rows)).toBe(JSON.stringify(r2.caseFile.ach.rows));
    expect(JSON.stringify(r1.caseFile.bottomLine)).toBe(JSON.stringify(r2.caseFile.bottomLine));
    expect(JSON.stringify(r1.caseFile.clusters)).toBe(JSON.stringify(r2.caseFile.clusters));
  });

  it("the kill switch halts the run and retracts nothing", () => {
    const collector: Collector = () => ({ boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], entitiesCollected: 2, spend: {}, remainingDiagnosticity: 1 });
    const r = runInvestigation(init, { collector, kill: { stopped: () => true }, now, entitiesPlanned: 2 });
    expect(r.record.status).toBe("halted");
    expect(r.record.stopCondition).toBe("kill_switch");
  });
});
