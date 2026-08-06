// Split-conformal calibration. Gates: the quantile uses the finite-sample
// correction (never the naive empirical quantile); too little calibration data
// → null, never a fake guarantee (rule 4/7); p-values are smoothed and valid;
// the guarantee text names alpha AND n.

import { describe, it, expect } from "vitest";
import {
  conformalQuantile,
  conformalPValue,
  conformalThreshold,
  CONFORMAL_MIN_CALIBRATION,
} from "../lib/analysis/conformal";

describe("conformalQuantile", () => {
  it("applies the finite-sample (n+1) correction", () => {
    const scores = Array.from({ length: 9 }, (_, i) => i + 1); // 1..9
    // n=9, alpha=0.1 -> k = ceil(10*0.9) = 9 -> the 9th smallest = 9
    expect(conformalQuantile(scores, 0.1)).toBe(9);
    // alpha=0.5 -> k = ceil(10*0.5) = 5 -> 5
    expect(conformalQuantile(scores, 0.5)).toBe(5);
  });

  it("returns null when n is too small to certify alpha (no clamping)", () => {
    // n=5, alpha=0.05 -> k = ceil(6*0.95) = 6 > 5 -> impossible
    expect(conformalQuantile([1, 2, 3, 4, 5], 0.05)).toBeNull();
    expect(conformalQuantile([], 0.1)).toBeNull();
    expect(conformalQuantile([1, 2, 3], 0)).toBeNull();
    expect(conformalQuantile([1, 2, 3], 1)).toBeNull();
  });

  it("does not mutate the input", () => {
    const scores = [3, 1, 2];
    conformalQuantile(scores, 0.5);
    expect(scores).toEqual([3, 1, 2]);
  });
});

describe("conformalPValue", () => {
  const nulls = Array.from({ length: 99 }, (_, i) => i + 1); // 1..99

  it("is smoothed: even the most extreme score has p >= 1/(n+1)", () => {
    expect(conformalPValue(nulls, 1000)).toBeCloseTo(1 / 100, 10);
  });

  it("a mid-pack score gets a mid p-value; a low score p near 1", () => {
    expect(conformalPValue(nulls, 50)).toBeCloseTo((50 + 1) / 100, 10);
    expect(conformalPValue(nulls, 0)).toBeCloseTo(1, 10);
  });

  it("null on no calibration data or a non-finite score", () => {
    expect(conformalPValue([], 5)).toBeNull();
    expect(conformalPValue(nulls, NaN)).toBeNull();
  });
});

describe("conformalThreshold", () => {
  const benign = Array.from({ length: 40 }, (_, i) => (i % 10) / 10); // 0..0.9 repeating

  it("issues a band with an honest guarantee naming alpha and n", () => {
    const band = conformalThreshold(benign, 0.1)!;
    expect(band).toBeTruthy();
    expect(band.n).toBe(40);
    expect(band.alpha).toBe(0.1);
    expect(band.guarantee).toMatch(/10%/);
    expect(band.guarantee).toMatch(/40 reviewed/);
    expect(band.guarantee).toMatch(/exchangeable/); // the assumption is stated
  });

  it("refuses below the calibration floor (Unknown is a valid answer)", () => {
    expect(conformalThreshold(benign.slice(0, CONFORMAL_MIN_CALIBRATION - 1), 0.1)).toBeNull();
  });

  it("empirically bounds the false-alarm rate on exchangeable data", () => {
    // Deterministic pseudo-random benign scores; flag rate above the threshold
    // must be <= alpha (up to the +1/(n+1) discretization).
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const calib = Array.from({ length: 200 }, rnd);
    const future = Array.from({ length: 2000 }, rnd);
    const band = conformalThreshold(calib, 0.1)!;
    const falseAlarms = future.filter((s) => s > band.threshold).length / future.length;
    expect(falseAlarms).toBeLessThanOrEqual(0.1 + 1 / (calib.length + 1) + 0.02);
  });

  it("ignores non-finite scores instead of corrupting the quantile", () => {
    const withJunk = [...benign, NaN, Infinity, -Infinity];
    const band = conformalThreshold(withJunk, 0.1)!;
    expect(band.n).toBe(40);
  });
});
