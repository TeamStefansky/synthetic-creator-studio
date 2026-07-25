import { describe, it, expect } from "vitest";
import { runStandingDissent, applyDissentVeto, reservedDissentBudget, conceptionMonitor, conceptionRatio, DISSENT_RESERVED_BUDGET } from "../../lib/agent/dissent";
import { buildPremortem, structuredSelfCritique } from "../../lib/agent/premortem";
import { teamAB, checkArgumentMap, multipleScenarios } from "../../lib/agent/pluralism";
import { analyzeAudience, assertNoNamedIndividual } from "../../lib/case/audience";
import { synthesizeCase } from "../../lib/case/synthesize";
import { runAdversary } from "../../lib/agent/adversary";
import { assessDeception } from "../../lib/case/deception";

describe("standing dissent (06·P6)", () => {
  it("its reserved budget survives a collection overrun", () => {
    expect(reservedDissentBudget(true)).toEqual(DISSENT_RESERVED_BUDGET);
    expect(reservedDissentBudget(true).llmTokens).toBe(DISSENT_RESERVED_BUDGET.llmTokens);
  });
  it("the veto forces undetermined and the narrator cannot soften it", () => {
    const cf = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High", characteristic: "individual" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const adv = runAdversary({ ach: cf.ach, deception: assessDeception({}) }); // one signal => easy counter-case
    const dissent = runStandingDissent(adv);
    // even if a narrator wanted "leading_holds", the veto wins:
    expect(applyDissentVeto("leading_holds", { text: dissent.text, forcesUndetermined: true })).toBe("undetermined");
    expect(dissent.text.length).toBeGreaterThan(0); // stored verbatim, non-empty
  });
});

describe("conception monitor (06·P6)", () => {
  it("a collapsing inconsistency ratio at steady volume raises the warning and forces regeneration", () => {
    const ratios = [0.3, 0.25, 0.18, 0.1, 0.05, 0.02];
    const volumes = [10, 10, 11, 10, 10, 11];
    const r = conceptionMonitor(ratios, volumes);
    expect(r.warn).toBe(true);
    expect(r.forceRegenerate).toBe(true);
    expect(r.reason).toMatch(/stopped accumulating contradictions/);
  });
  it("a healthy ratio does not warn; conceptionRatio is inconsistent/total", () => {
    expect(conceptionRatio(3, 10)).toBe(0.3);
    expect(conceptionMonitor([0.3, 0.28, 0.31], [10, 10, 10]).warn).toBe(false);
  });
});

describe("premortem + self-critique (06·P6)", () => {
  it("renders labeled failure-path statements", () => {
    const cf = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High", characteristic: "individual", evidenceId: "ga" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    const pm = buildPremortem(cf);
    expect(pm.statements.length).toBeGreaterThan(1);
    expect(pm.statements.every((s) => ["FACT", "INFERENCE", "ASSUMPTION", "SPECULATION"].includes(s.label))).toBe(true);
    expect(structuredSelfCritique({ sources: true, gaps: true }).unresolved).toContain("deception");
  });
});

describe("structured pluralism (06·P6)", () => {
  it("Team A/Team B: the comparison is the product; divergence is not resolved silently", () => {
    const r = teamAB({ verdict: "leading_holds", reasons: [] }, { verdict: "undetermined", reasons: [] });
    expect(r.convergent).toBe(false);
    expect(r.product).toMatch(/Divergent/);
    expect(r.divergence).toMatch(/Team A.*Team B/);
  });
  it("an argument map with an unstated warrant is flagged", () => {
    expect(checkArgumentMap({ claim: "linked", premises: ["shared GA id"], objections: [], warrant: "" }).unstatedWarrant).toBe(true);
    expect(checkArgumentMap({ claim: "linked", premises: ["shared GA id"], objections: [], warrant: "a shared account id implies common control" }).unstatedWarrant).toBe(false);
  });
  it("multiple scenarios vary the key drivers", () => {
    const s = multipleScenarios([{ name: "operator", values: ["one", "two"] }, { name: "timing", values: ["organic", "coordinated"] }]);
    expect(s).toHaveLength(4);
  });
});

describe("audience analysis — segment level only (06·P6 ethics)", () => {
  it("weights mismatches highest and never represents a named individual", () => {
    const a = analyzeAudience([
      { segment: "diaspora forum", register: "dated slang", mismatch: true, alternative: "a diaspora author explains the same signal" },
      { segment: "local news comments", register: "native", mismatch: false, alternative: "" },
    ]);
    expect(a.mismatchesFirst[0].mismatch).toBe(true);
    expect(() => assertNoNamedIndividual(a)).not.toThrow();
    // a named individual in a segment is a targeting product => rejected
    const bad = analyzeAudience([{ segment: "John Smith", register: "x", mismatch: true, alternative: "" }]);
    expect(() => assertNoNamedIndividual(bad)).toThrow(/named individual/);
  });
});
