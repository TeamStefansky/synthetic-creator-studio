import { describe, it, expect } from "vitest";
import { runAch, type AchItem } from "../../lib/case/hypotheses";
import { assessDeception } from "../../lib/case/deception";
import { analyzeAssumptions, assertNonEmptyFalsification } from "../../lib/case/assumptions";

const item = (id: string, kind: AchItem["kind"], enteredCaseAt?: string): AchItem => ({ id, label: id, kind, enteredCaseAt });
const noIndicators = assessDeception({});
const strongIndicators = assessDeception({ mom: { motive: true, opportunity: true }, pop: { priorDeception: true } });

describe("ACH — competing hypotheses (P5)", () => {
  it("the null and the deception hypothesis are always present", () => {
    const r = runAch({ items: [], deception: noIndicators });
    const kinds = r.rows.map((row) => row.kind);
    expect(kinds).toContain("coincidence_null");
    expect(kinds).toContain("deception");
    expect(kinds).toContain("same_operator");
  });

  it("deception without positive MOM-POP never outranks a simpler hypothesis", () => {
    // 2 individualizing + 2 negative: deception has 0 inconsistencies (absorbs all).
    const items = [item("i1", "individualizing"), item("i2", "individualizing"), item("n1", "negative"), item("n2", "negative")];
    const r = runAch({ items, deception: noIndicators });
    expect(r.deceptionCappedReason).toBeTruthy();
    expect(r.leading).not.toBe("deception"); // capped out of the lead
  });

  it("deception CAN lead once positive MOM-POP indicators are supplied", () => {
    const items = [item("i1", "individualizing"), item("i2", "individualizing"), item("n1", "negative"), item("n2", "negative")];
    const r = runAch({ items, deception: strongIndicators });
    expect(r.deceptionCappedReason).toBeUndefined();
    expect(r.leading).toBe("deception");
    expect(r.undetermined).toBe(false);
  });

  it("an ambiguous case (top two within the tie threshold) is undetermined", () => {
    const r = runAch({ items: [item("i1", "individualizing")], deception: noIndicators });
    expect(r.undetermined).toBe(true);
    expect(r.leading).toBeUndefined();
  });

  it("evidence entering after the hypothesis was formed is flagged", () => {
    const items = [item("late", "individualizing", "2026-06-01T00:00:00Z")];
    const r = runAch({ items, deception: noIndicators, hypothesisFormedAt: "2026-01-01T00:00:00Z" });
    expect(r.items.find((i) => i.id === "late")!.postHypothesis).toBe(true);
  });

  it("class-only overlaps are non-diagnostic; individualizing ones are diagnostic", () => {
    const r = runAch({ items: [item("c", "class"), item("i", "individualizing")], deception: noIndicators });
    expect(r.items.find((i) => i.id === "c")!.diagnostic).toBe(false);
    expect(r.items.find((i) => i.id === "i")!.diagnostic).toBe(true);
  });

  it("the leading hypothesis always carries a non-empty falsification list", () => {
    const r = runAch({ items: [item("i1", "individualizing"), item("i2", "individualizing"), item("n1", "negative"), item("n2", "negative")], deception: strongIndicators });
    expect(assertNonEmptyFalsification(r.falsification)).toBe(true);
    expect(assertNonEmptyFalsification([])).toBe(false); // an empty list fails validation
  });
});

describe("Key Assumptions Check (P5)", () => {
  it("a load-bearing low-confidence assumption surfaces in the summary", () => {
    const r = analyzeAssumptions([
      { id: "a1", text: "the shared analytics id is self-hosted", confidence: "low", loadBearing: true },
      { id: "a2", text: "RDAP dates are accurate", confidence: "high", loadBearing: true },
    ]);
    expect(r.critical.map((a) => a.id)).toEqual(["a1"]);
    expect(r.summaryLines[0]).toMatch(/self-hosted/);
  });
});
