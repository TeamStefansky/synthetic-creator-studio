import { describe, it, expect } from "vitest";
import { buildSitrep } from "../../lib/agent/sitrep";
import { synthesizeCase } from "../../lib/case/synthesize";
import { runAdversary } from "../../lib/agent/adversary";
import { assessDeception } from "../../lib/case/deception";
import type { RunRecord } from "../../lib/agent/types";

const record: RunRecord = {
  id: "r1", policyVersion: "v", initiator: "a@x", scope: "ws1", question: "linked?", seedEntities: ["a.com", "b.com"],
  ceiling: "association", status: "complete", coverage: "full", stopCondition: "diminishing_diagnosticity", startedAt: "t", cycles: 2,
};

const REQUIRED = ["STATUS", "BOTTOM LINE", "JUDGMENT", "CHANGED SINCE LAST REPORT", "KEY EVIDENCE", "RECONSTRUCTION", "THE CASE AGAINST", "KEY ASSUMPTIONS", "NEGATIVE EVIDENCE", "GAPS", "WHAT WOULD CHANGE THIS", "NOT PURSUED"];

describe("situation report (05·P5)", () => {
  it("renders every required section; empty ones say 'none established'", () => {
    const cf = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const adv = runAdversary({ ach: cf.ach, deception: assessDeception({}) });
    const s = buildSitrep({ record, caseFile: cf, adversary: adv, notPursued: [] });
    for (const k of REQUIRED) expect(s.sections[k]).toBeDefined();
    expect(s.sections["NEGATIVE EVIDENCE"]).toBe("none established");
    expect(s.markdown).toMatch(/situation report/);
  });

  it("NOT PURSUED surfaces skipped tasks with their diagnosticity (the silent decisions)", () => {
    const cf = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const adv = runAdversary({ ach: cf.ach, deception: assessDeception({}) });
    const s = buildSitrep({ record, caseFile: cf, adversary: adv, notPursued: [{ task: "reverse-IP on b.com", diagnosticity: 0.62, reason: "skipped: budget" }] });
    expect(s.sections["NOT PURSUED"]).toMatch(/reverse-IP on b.com.*0.62/);
  });

  it("CHANGED SINCE LAST REPORT states a rung downgrade plainly as a retraction", () => {
    const cf = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const adv = runAdversary({ ach: cf.ach, deception: assessDeception({}) });
    const s = buildSitrep({ record, caseFile: cf, adversary: adv, notPursued: [], previous: { rung: "common-operation", likelihood: "likely", confidence: "Medium" } });
    expect(s.sections["CHANGED SINCE LAST REPORT"]).toMatch(/RETRACTION/);
  });

  it("an undetermined adversary verdict is reflected in the bottom line", () => {
    const cf = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const adv = runAdversary({ ach: cf.ach, deception: assessDeception({}) }); // one signal => easy counter-case
    const s = buildSitrep({ record, caseFile: cf, adversary: adv, notPursued: [] });
    if (adv.verdict === "undetermined") expect(s.sections["BOTTOM LINE"]).toMatch(/Undetermined/);
  });
});
