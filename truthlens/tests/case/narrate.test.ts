import { describe, it, expect } from "vitest";
import { validateStatements, dropReason, type RawStatement, type ValidationCtx } from "../../lib/case/narrate";
import { rungOf, exceedsRung, hasBannedPhrase, namesPerson } from "../../lib/case/lexicon";

const ctx: ValidationCtx = {
  validEvidenceIds: new Set(["ev1", "ev2"]),
  observedEvidenceIds: new Set(["ev1"]),        // ev2 is valid but NOT directly observed
  establishedOrderings: new Set(["A->B"]),
  deceptionComplete: false,
};

const good: RawStatement = { text: "a.com shares a non-wildcard certificate SAN with b.com", label: "FACT", evidenceIds: ["ev1"], rung: "association" };

describe("lexicon rung ladder (P6)", () => {
  it("agency verbs are attribution rung; association verbs are not", () => {
    expect(rungOf("the sites are operated by the same group")).toBe("attribution");
    expect(rungOf("a.com shares an analytics id with b.com")).toBe("association");
    expect(exceedsRung("operated by the same group", "association")).toBe(true);
  });
  it("banned phrasing and person names are caught", () => {
    expect(hasBannedPhrase("sources indicate the two are linked")).toBe(true);
    expect(hasBannedPhrase("likely (70%) the same operator")).toBe(true);
    expect(namesPerson("John Smith runs the account")).toBe(true);
    expect(namesPerson("a.com shares infra with b.com")).toBe(false);
  });
});

describe("reconstruction validator - adversarial fixture (P6)", () => {
  const adversarial: RawStatement[] = [
    { text: "a.com shares y", label: "INFERENCE", evidenceIds: [], rung: "association" },                                   // 1 uncited
    { text: "John Smith operated the account", label: "INFERENCE", evidenceIds: ["ev1"], rung: "attribution" },             // 2 names a person
    { text: "the two sites are operated by the same group", label: "INFERENCE", evidenceIds: ["ev1"], rung: "association" },// 3 ownership at association rung
    { text: "a.com shares G-123 with b.com", label: "FACT", evidenceIds: ["ev2"], rung: "association" },                    // 4 FACT w/o observed evidence
    { text: "a.com shares infra with b.com", label: "INFERENCE", evidenceIds: ["ev1"], likelihood: "likely", rung: "association" }, // 5 likelihood w/o confidence
    { text: "content moved from B to C", label: "INFERENCE", evidenceIds: ["ev1"], rung: "association", assertsOrdering: { from: "B", to: "C" } }, // 6 unestablished ordering
  ];

  it("removes all six violations and counts them", () => {
    const r = validateStatements(adversarial, ctx);
    expect(r.dropped).toHaveLength(6);
    const reasons = r.dropped.map((d) => d.reason).join(" | ");
    expect(reasons).toMatch(/no evidence id/);
    expect(reasons).toMatch(/names a person/);
    expect(reasons).toMatch(/exceeds recorded rung/);
    expect(reasons).toMatch(/FACT label without a directly observed/);
    expect(reasons).toMatch(/likelihood without confidence/);
    expect(reasons).toMatch(/ordering the path layer did not establish/);
  });

  it("more than half removed => no reconstruction is published", () => {
    const r = validateStatements(adversarial, ctx);
    expect(r.suppressed).toBe(true);
    expect(r.kept).toHaveLength(0);
    expect(r.message).toMatch(/does not support a connected account/);
  });

  it("a mostly-valid set keeps the good statements and counts the drop", () => {
    const r = validateStatements([good, good, good, adversarial[0]], ctx);
    expect(r.suppressed).toBe(false);
    expect(r.kept).toHaveLength(3);
    expect(r.dropped).toHaveLength(1);
    expect(r.message).toMatch(/1 of 4/);
  });

  it("attribution rung requires a completed deception assessment", () => {
    const s: RawStatement = { text: "the network was coordinated", label: "INFERENCE", evidenceIds: ["ev1"], rung: "attribution" };
    expect(dropReason(s, ctx)).toMatch(/attribution rung without a completed deception assessment/);
    expect(dropReason(s, { ...ctx, deceptionComplete: true })).toBeNull(); // now allowed (language matches rung)
  });

  it("a fully valid statement passes and validation is deterministic", () => {
    expect(dropReason(good, ctx)).toBeNull();
    expect(JSON.stringify(validateStatements([good], ctx))).toBe(JSON.stringify(validateStatements([good], ctx)));
  });
});
