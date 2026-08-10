import { describe, it, expect } from "vitest";
import { assessSufficiency, compare, blindVerify, inconclusiveRate, inconclusiveRateBelowFloor, type ComparisonInput } from "../../lib/agent/examine";

describe("examination discipline (06·P4)", () => {
  it("sufficiency is assessed on the artifact's own merits and recorded BEFORE comparison", () => {
    const r = assessSufficiency("ssl_san", 0.3); // a wildcard/CDN cert
    expect(r.decision).toBe("insufficient");
    expect(r.recordedBefore).toBe(true);
    expect(assessSufficiency("ssl_san", 0.9).decision).toBe("sufficient");
  });

  it("CONTEXT FIREWALL: the comparator sees only its input - case theory cannot change its output", () => {
    const input: ComparisonInput = { kind: "ga_id", valueA: "G-1", valueB: "G-1", sufficientA: true, sufficientB: true };
    // There is no way to pass a hypothesis/ranking to compare(); running it under
    // "opposite theories" (which it cannot receive) is byte-identical.
    expect(compare(input)).toBe(compare({ ...input }));
    expect(compare(input)).toBe("identification");
    // @ts-expect-error - the input type has no hypothesis/theory field to leak in
    const _leak: ComparisonInput = { ...input, leadingHypothesis: "same_operator" };
    void _leak;
  });

  it("inconclusive is a first-class, expected outcome", () => {
    expect(compare({ kind: "ga_id", valueA: "G-1", valueB: "G-1", sufficientA: false, sufficientB: true })).toBe("inconclusive");
    expect(compare({ kind: "ga_id", valueA: "G-1", valueB: "G-2", sufficientA: true, sufficientB: true })).toBe("exclusion");
  });

  it("BLIND VERIFICATION: disagreement yields inconclusive - never the stronger reading", () => {
    expect(blindVerify("identification", "identification")).toBe("identification");
    expect(blindVerify("identification", "exclusion")).toBe("inconclusive");
    expect(blindVerify("identification", "inconclusive")).toBe("inconclusive");
  });

  it("the inconclusive rate is reported and a too-low rate is flagged", () => {
    expect(inconclusiveRate(["identification", "inconclusive", "exclusion", "inconclusive"])).toBe(0.5);
    expect(inconclusiveRateBelowFloor(new Array(20).fill("identification"))).toBe(true); // never inconclusive => flag
  });
});
