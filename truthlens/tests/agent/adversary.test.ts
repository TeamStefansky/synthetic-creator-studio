import { describe, it, expect } from "vitest";
import { runAdversary, gateAgentStatements } from "../../lib/agent/adversary";
import { runAch, type AchItem } from "../../lib/case/hypotheses";
import { assessDeception } from "../../lib/case/deception";

const item = (id: string, kind: AchItem["kind"]): AchItem => ({ id, label: id, kind });
const noInd = assessDeception({});
const strongInd = assessDeception({ mom: { motive: true }, pop: { priorDeception: true } });

describe("adversarial pass (05·P4)", () => {
  it("builds and stores the counter-case in full (first-class, not a footnote)", () => {
    const ach = runAch({ items: [item("i1", "individualizing"), item("i2", "individualizing"), item("n1", "negative"), item("n2", "negative")], deception: strongInd });
    const adv = runAdversary({ ach, deception: strongInd });
    expect(adv.counter).toBeTruthy();
    expect(adv.reasons.length).toBeGreaterThan(0);
    expect(adv.reasons.join(" ")).toMatch(/counter-case/i);
  });

  it("when the evidence underdetermines the answer, the verdict is undetermined and says the counter-case was easy", () => {
    const ach = runAch({ items: [item("i1", "individualizing")], deception: noInd }); // one weak signal
    const adv = runAdversary({ ach, deception: noInd });
    expect(adv.verdict).toBe("undetermined");
    expect(adv.counterCaseEasyToBuild).toBe(true);
    expect(adv.reasons.join(" ")).toMatch(/EASY to build/i);
  });

  it("names the single load-bearing item when the conclusion depends on it", () => {
    const ach = runAch({ items: [item("i1", "individualizing"), item("i2", "individualizing"), item("n1", "negative"), item("n2", "negative")], deception: strongInd });
    const adv = runAdversary({ ach, deception: strongInd, loadBearing: "shared GA id G-123" });
    expect(adv.loadBearing).toBe("shared GA id G-123");
    expect(adv.reasons.join(" ")).toMatch(/depends on a single item/);
  });

  it("convenient evidence is weighted down and the deception question stays open", () => {
    const conv = assessDeception({ eve: { evidenceTooConvenient: true }, mom: { motive: true }, pop: { priorDeception: true } });
    const ach = runAch({ items: [item("i1", "individualizing")], deception: conv });
    const adv = runAdversary({ ach, deception: conv });
    expect(adv.reasons.join(" ")).toMatch(/weighted DOWN/);
  });
});

describe("rung gating at publication (05·P4)", () => {
  it("common-operation is proposed (review queue), attribution rejected, association published", () => {
    const g = gateAgentStatements([
      { rung: "association", text: "a.com shares a SAN with b.com" },
      { rung: "common-operation", text: "the same party operates a.com and b.com" },
      { rung: "attribution", text: "actor X operates them" },
    ], "association");
    expect(g.published.map((s) => s.rung)).toEqual(["association"]);
    expect(g.proposed).toHaveLength(1);            // common-operation -> awaiting analyst approval
    expect(g.proposed[0].reason).toMatch(/exceeds the agent ceiling/);
    expect(g.rejected).toHaveLength(1);            // attribution -> dropped with reason
    expect(g.rejected[0].reason).toMatch(/human-only/);
  });
});
