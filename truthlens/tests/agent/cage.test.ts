import { describe, it, expect } from "vitest";
import {
  classifyPublication, agentDiscover, agentCaseEntities, checkpoint, AgentHalted,
  startRun, assertEvidenceNotConclusion, asCrossCaseEvidence, agentConfidence, AGENT_CEILING,
} from "../../lib/agent/authority";
import { overBudget, agentCoverage, MAX_EXTERNAL_CALLS, ZERO_SPEND } from "../../lib/agent/budget";
import { synthesizeCase } from "../../lib/case/synthesize";
import { monitorDiff } from "../../lib/case/diff";
import type { RunInit } from "../../lib/agent/types";
import type { EvidenceItem } from "../../lib/case/types";

const init: RunInit = { initiator: "analyst@x", scope: "ws1", question: "linked?", seedEntities: ["a.com", "b.com"], ceiling: AGENT_CEILING };
const evidence: EvidenceItem = { id: "e1", entityKey: "domain:a.com", kind: "ga_id", value: "G-1", normalizedValue: "g-1", enteredCaseAt: "t", state: "live", provenances: [] };

describe("agent authority cage — rung ceiling (05·P1)", () => {
  it("association publishes, common-operation is a PROPOSAL, attribution is rejected", () => {
    expect(classifyPublication("association").action).toBe("publish");
    expect(classifyPublication("common-operation").action).toBe("propose");
    expect(classifyPublication("attribution").action).toBe("reject");
  });
});

describe("agent scope lock (05·P1)", () => {
  it("a discovered entity goes to the candidate queue and NEVER into the case", () => {
    const queue = agentDiscover([], { entity: "c.com", linkedTo: "a.com", strength: "High", evidence: "shared GA", discoveredAt: "t" });
    expect(queue[0].accepted).toBe(false);
    expect(agentCaseEntities(["a.com", "b.com"], queue)).toEqual(["a.com", "b.com"]); // case unchanged
  });
});

describe("agent kill switch (05·P1)", () => {
  it("checkpoint halts when the switch is set", () => {
    expect(() => checkpoint({ stopped: () => false })).not.toThrow();
    expect(() => checkpoint({ stopped: () => true })).toThrow(AgentHalted);
  });
});

describe("attributable initiation (05·P1)", () => {
  it("an unattributed run cannot start; a scoped, attributed one can", () => {
    expect(() => startRun({ ...init, initiator: "" }, "r1", "t")).toThrow(/unattributed/);
    expect(() => startRun({ ...init, scope: "" }, "r1", "t")).toThrow(/scoped|global/);
    const rec = startRun(init, "r1", "2026-01-01T00:00:00Z");
    expect(rec.initiator).toBe("analyst@x");
    expect(rec.ceiling).toBe("association");
    expect(rec.status).toBe("active");
  });
});

describe("no cross-case contamination (05·P1)", () => {
  it("evidence may cross (provenance intact); a conclusion may never be imported as evidence", () => {
    expect(() => assertEvidenceNotConclusion(evidence)).not.toThrow();
    expect(asCrossCaseEvidence(evidence).id).toBe("e1");
    const conclusion = { clusters: [], bottomLine: {}, ach: {} };
    expect(() => assertEvidenceNotConclusion(conclusion)).toThrow(/never be imported as evidence/);
  });
});

describe("confidence cannot be raised by re-reasoning (05·P1)", () => {
  it("confidence is read from the deterministic case computation, identical across passes", () => {
    const inputs = { entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" as const }], enteredCaseAt: "2026-01-01T00:00:00Z" };
    const c1 = agentConfidence(synthesizeCase(inputs));
    const c2 = agentConfidence(synthesizeCase(inputs)); // a second "pass" over the same ledger
    expect(c1).toBe(c2);
  });
});

describe("agent budget + partial-coverage retraction guard (05·P1)", () => {
  it("reaching a hard limit marks coverage partial", () => {
    expect(overBudget({ ...ZERO_SPEND, externalCalls: MAX_EXTERNAL_CALLS }).over).toBe(true);
    expect(agentCoverage({ spend: { ...ZERO_SPEND, externalCalls: MAX_EXTERNAL_CALLS }, entitiesPlanned: 5, entitiesCollected: 2 })).toBe("partial");
    expect(agentCoverage({ spend: ZERO_SPEND, entitiesPlanned: 5, entitiesCollected: 5 })).toBe("full");
  });

  it("a budget-truncated run retracts nothing and emits no alert", () => {
    const prev = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const truncated = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const coverage = agentCoverage({ spend: { ...ZERO_SPEND, externalCalls: MAX_EXTERNAL_CALLS }, entitiesPlanned: 2, entitiesCollected: 1 });
    const d = monitorDiff(prev, truncated, coverage);
    expect(coverage).toBe("partial");
    expect(d.alerts).toHaveLength(0);
    expect(d.suppressedRemovals).toBeGreaterThan(0);
  });
});
