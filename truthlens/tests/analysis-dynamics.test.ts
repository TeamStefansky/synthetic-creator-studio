import { describe, it, expect } from "vitest";
import {
  fitExponential,
  fitLogistic,
  burstiness,
  branchingRatio,
  changePoint,
  GROWTH_MIN_POINTS,
} from "@/lib/analysis/dynamics";

describe("growth fit", () => {
  it("recovers an exponential rate and doubling time with high R²", () => {
    const t = [0, 1, 2, 3, 4, 5];
    const y = t.map((tt) => 2 * Math.exp(0.5 * tt));
    const f = fitExponential(t, y);
    expect(f.insufficient).toBe(false);
    expect(f.rate).toBeCloseTo(0.5, 3);
    expect(f.doublingTime!).toBeCloseTo(Math.LN2 / 0.5, 3);
    expect(f.r2).toBeGreaterThan(0.99);
  });

  it("returns Insufficient below the point floor - no trend from 3 points", () => {
    const f = fitExponential([0, 1, 2], [1, 2, 4]);
    expect(f.insufficient).toBe(true);
    expect(f.model).toBe("none");
    expect(f.n).toBeLessThan(GROWTH_MIN_POINTS);
  });

  it("logistic fit produces a positive rate and decent R² on S-curve data", () => {
    const K = 100;
    const t = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const y = t.map((tt) => K / (1 + Math.exp(-(0.8 * tt - 4))));
    const f = fitLogistic(t, y, K);
    expect(f.insufficient).toBe(false);
    expect(f.rate).toBeGreaterThan(0);
    expect(f.r2).toBeGreaterThan(0.95);
  });
});

describe("burstiness", () => {
  it("regular (machine-like) posting gives B ≈ −1 and CV ≈ 0", () => {
    const b = burstiness([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(b.insufficient).toBe(false);
    expect(b.burstiness).toBeCloseTo(-1, 2);
    expect(b.cv).toBeCloseTo(0, 6);
  });

  it("clustered (human/coordinated bursts) gives B > 0", () => {
    const b = burstiness([0, 0.1, 0.2, 10, 10.1, 10.2, 20, 20.1]);
    expect(b.burstiness).toBeGreaterThan(0);
  });

  it("Insufficient below the event floor", () => {
    expect(burstiness([1, 2]).insufficient).toBe(true);
  });
});

describe("Hawkes branching ratio", () => {
  it("clustered spread is more self-exciting than regular arrivals", () => {
    const regular = Array.from({ length: 15 }, (_, i) => i); // evenly spaced
    const clustered = [0, 0.1, 0.2, 0.3, 5, 5.1, 5.2, 5.3, 10, 10.1, 10.2, 10.3];
    const rr = branchingRatio(regular);
    const cc = branchingRatio(clustered);
    expect(rr.insufficient).toBe(false);
    expect(cc.insufficient).toBe(false);
    expect(cc.branchingRatio).toBeGreaterThan(rr.branchingRatio);
    expect(rr.branchingRatio).toBeLessThan(0.9); // subcritical / organic-leaning
  });

  it("Insufficient below the event floor", () => {
    expect(branchingRatio([1, 2, 3, 4, 5]).insufficient).toBe(true);
  });

  it("is deterministic (rule 8)", () => {
    const ev = [0, 0.1, 0.2, 0.3, 5, 5.1, 5.2, 5.3, 10, 10.1, 10.2, 10.3];
    expect(branchingRatio(ev)).toEqual(branchingRatio(ev));
  });
});

describe("change-point detection", () => {
  it("detects a level shift and dates it near the jump", () => {
    const series = [1, 1, 1, 1, 2, 8, 9, 9, 9, 9];
    const cp = changePoint(series, 7, 400);
    expect(cp.insufficient).toBe(false);
    expect(cp.detected).toBe(true);
    expect(cp.index!).toBeGreaterThanOrEqual(3);
    expect(cp.index!).toBeLessThanOrEqual(6);
  });

  it("does not fabricate a change on a flat series", () => {
    const cp = changePoint([5, 5, 5, 5, 5, 5, 5, 5], 7, 200);
    expect(cp.detected).toBe(false);
  });

  it("Insufficient below the point floor", () => {
    expect(changePoint([1, 2, 3]).insufficient).toBe(true);
  });

  it("is deterministic with a fixed seed", () => {
    const s = [1, 1, 1, 2, 8, 9, 9, 9, 9, 9];
    expect(changePoint(s, 3, 200)).toEqual(changePoint(s, 3, 200));
  });
});
