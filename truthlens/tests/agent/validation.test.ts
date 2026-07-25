import { describe, it, expect } from "vitest";
import { runValidation, runValidationWith, KNOWN_NEGATIVE, KNOWN_POSITIVE, FPR_CEILING, type MethodFixture } from "../../lib/agent/validation";

describe("measured error rate (06·P2)", () => {
  it("CI GATE: the method's measured false-positive rate is at or below the ceiling", () => {
    const r = runValidation();
    expect(r.falsePositiveRate).toBeLessThanOrEqual(FPR_CEILING); // fails the build if it regresses
    expect(r.passed).toBe(true);
  });

  it("known negatives (the hard cases) do not cluster; known positives do", () => {
    const r = runValidation();
    expect(r.falsePositiveRate).toBe(0);   // class-only pairs never cluster
    expect(r.falseNegativeRate).toBe(0);   // individual-characteristic pairs always cluster
  });

  it("the known-negative set is the larger of the two (inventing links is the real risk)", () => {
    expect(KNOWN_NEGATIVE.length).toBeGreaterThan(KNOWN_POSITIVE.length);
  });

  it("a loosened rule that lets a negative pair link pushes FPR above ceiling and FAILS", () => {
    // Simulate the bug: a class-only pair mis-tagged as individual would cluster.
    const loosened: MethodFixture[] = KNOWN_NEGATIVE.map((f, i) =>
      i === 0 ? { ...f, edges: f.edges.map((e) => ({ ...e, characteristic: "individual" as const, strength: "High" as const })) } : f,
    );
    const r = runValidationWith(loosened, KNOWN_POSITIVE);
    expect(r.falsePositiveRate).toBeGreaterThan(0);
    expect(r.passed).toBe(false); // build would fail
  });

  it("every report can carry the measured rate + sample size + suite version", () => {
    const r = runValidation();
    expect(r.sampleSize).toBe(KNOWN_NEGATIVE.length + KNOWN_POSITIVE.length);
    expect(r.fixtureSuiteVersion).toBeTruthy();
  });
});
