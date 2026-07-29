import { describe, it, expect } from "vitest";
import {
  combineEvidence,
  bandFor,
  reliabilityCurve,
  calibrationError,
  INFO_FLOOR_NATS,
  type EvidenceItem,
} from "@/lib/analysis/evidence";

describe("Bayesian combination", () => {
  it("supporting indicators raise the posterior above the prior", () => {
    const items: EvidenceItem[] = [
      { id: "a", lr: 4 },
      { id: "b", lr: 3 },
      { id: "c", lr: 2 },
    ];
    const r = combineEvidence(items, 0.5);
    expect(r.posterior).toBeGreaterThan(0.5);
    expect(r.insufficient).toBe(false);
    // audit trail present, one update per item, monotone rising for supporting LRs
    expect(r.updates).toHaveLength(3);
    expect(r.updates[2].posteriorAfter).toBeGreaterThan(r.updates[0].posteriorAfter);
  });

  it("a refuting indicator (LR<1) lowers the posterior", () => {
    const up = combineEvidence([{ id: "a", lr: 5 }], 0.5).posterior;
    const down = combineEvidence([{ id: "a", lr: 5 }, { id: "b", lr: 0.2 }], 0.5).posterior;
    expect(down).toBeLessThan(up);
  });

  it("returns Insufficient when total information is below the floor (Unknown)", () => {
    const r = combineEvidence([{ id: "a", lr: 1.05 }], 0.5); // negligible information
    expect(r.information).toBeLessThan(INFO_FLOOR_NATS);
    expect(r.band).toBe("Insufficient");
    expect(r.insufficient).toBe(true);
  });

  it("empty evidence is Insufficient, not a confident 50%", () => {
    expect(combineEvidence([], 0.5).insufficient).toBe(true);
  });
});

describe("dependence down-weighting", () => {
  it("correlated signals do not count as independent confirmations", () => {
    const independent = combineEvidence(
      [{ id: "a", lr: 4 }, { id: "b", lr: 4 }],
      0.5,
    ).posterior;
    const correlated = combineEvidence(
      [{ id: "a", lr: 4, group: "g" }, { id: "b", lr: 4, group: "g" }],
      0.5,
    ).posterior;
    expect(correlated).toBeLessThan(independent);
  });
});

describe("sensitivity analysis", () => {
  it("flags a fragile verdict that rests on one indicator", () => {
    // one strong signal pushes to High; the rest are negligible → removing it flips band
    const r = combineEvidence(
      [
        { id: "key", lr: 40 },
        { id: "x", lr: 1.02 },
      ],
      0.5,
    );
    expect(r.band).toBe("High");
    expect(r.sensitivity.mostInfluential).toBe("key");
    expect(r.sensitivity.flipsBand).toBe(true);
  });
});

describe("band mapping (documented, versioned)", () => {
  it("maps posteriors to bands only above the information floor", () => {
    expect(bandFor(0.9, 5)).toBe("High");
    expect(bandFor(0.7, 5)).toBe("Moderate");
    expect(bandFor(0.55, 5)).toBe("Low");
    expect(bandFor(0.9, 0.1)).toBe("Insufficient"); // strong-looking but no information
  });
});

describe("calibration harness", () => {
  it("a well-calibrated set has near-zero calibration error", () => {
    // in the 0.9 bin, 9/10 positive; in the 0.1 bin, 1/10 positive → calibrated
    const preds = [
      ...Array.from({ length: 10 }, (_, i) => ({ p: 0.9, label: i < 9 })),
      ...Array.from({ length: 10 }, (_, i) => ({ p: 0.1, label: i < 1 })),
    ];
    expect(calibrationError(preds)).toBeLessThan(0.05);
  });

  it("a miscalibrated set has large calibration error", () => {
    // claims 0.9 but only half are positive
    const preds = Array.from({ length: 10 }, (_, i) => ({ p: 0.9, label: i < 5 }));
    expect(calibrationError(preds)).toBeGreaterThan(0.3);
  });

  it("reliability curve reports predicted vs observed per populated bin", () => {
    const curve = reliabilityCurve([
      { p: 0.9, label: true },
      { p: 0.9, label: true },
      { p: 0.1, label: false },
    ]);
    expect(curve.length).toBe(2);
    const hi = curve.find((b) => b.predicted > 0.5)!;
    expect(hi.observed).toBe(1);
  });
});
