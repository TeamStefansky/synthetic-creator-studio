import { describe, it, expect } from "vitest";
import {
  erf,
  normalCdf,
  normalInv,
  studentTInv,
  gammp,
  chiSquareCdf,
  describe as describeStats,
  quantile,
  wilsonInterval,
  tInterval,
  robustZ,
  poissonTail,
  negBinomTail,
  twoProportionTest,
  mannWhitneyU,
  chiSquareTest,
  benjaminiHochberg,
} from "@/lib/analysis/stats";

const near = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("special functions (textbook values)", () => {
  it("erf(1) ≈ 0.8427", () => near(erf(1), 0.8427, 1e-4));
  it("Φ(1.96) ≈ 0.975", () => near(normalCdf(1.96), 0.975, 1e-3));
  it("Φ⁻¹(0.975) ≈ 1.96", () => near(normalInv(0.975), 1.959964, 1e-4));
  it("Student-t 0.975 quantile df=7 ≈ 2.365", () => near(studentTInv(0.975, 7), 2.365, 0.02));
  it("gammp regularizes: P(a=3,x=3) ≈ 0.5768", () => near(gammp(3, 3), 0.5768, 2e-3));
  it("chi-square CDF at 3.84, df=1 ≈ 0.95", () => near(chiSquareCdf(3.841, 1), 0.95, 2e-3));
});

describe("descriptive + quantile", () => {
  it("median and quartiles (type-7)", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    near(quantile(xs, 0.5), 5, 1e-9);
    near(quantile(xs, 0.25), 3, 1e-9);
    near(quantile(xs, 0.75), 7, 1e-9);
  });
  it("sample sd of [2,4,4,4,5,5,7,9] ≈ 2.138", () => {
    const d = describeStats([2, 4, 4, 4, 5, 5, 7, 9]);
    near(d.mean, 5, 1e-9);
    near(d.sd, 2.13809, 1e-3);
  });
});

describe("wilson interval (small-sample proportion)", () => {
  it("1/10 at 95% ≈ [0.018, 0.404] - wide, not a bare 10%", () => {
    const ci = wilsonInterval(1, 10, 0.95);
    near(ci.point, 0.1, 1e-9);
    near(ci.lower, 0.0179, 3e-3);
    near(ci.upper, 0.4041, 3e-3);
  });
  it("n=0 returns the full [0,1] (Unknown, never fabricated)", () => {
    const ci = wilsonInterval(0, 0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(1);
  });
});

describe("t-interval", () => {
  it("[2,4,4,4,5,5,7,9] 95% ≈ [3.21, 6.79]", () => {
    const ci = tInterval([2, 4, 4, 4, 5, 5, 7, 9], 0.95);
    near(ci.lower, 3.212, 0.03);
    near(ci.upper, 6.788, 0.03);
  });
  it("n<2 is Insufficient-width (infinite)", () => {
    const ci = tInterval([5], 0.95);
    expect(ci.lower).toBe(-Infinity);
    expect(ci.upper).toBe(Infinity);
  });
});

describe("count-spike tail tests (not Gaussian z on low counts)", () => {
  it("Poisson P(X≥10 | λ=3) ≈ 0.0011", () => near(poissonTail(10, 3).pValue, 0.0011, 3e-4));
  it("overdispersed series uses NB and yields a larger p than Poisson", () => {
    const k = 10;
    const m = 3;
    const v = 12; // variance >> mean -> overdispersed
    const nb = negBinomTail(k, m, v).pValue;
    const po = poissonTail(k, m).pValue;
    expect(nb).toBeGreaterThan(po); // NB is less surprised by the spike
  });
  it("NB falls back to Poisson when not overdispersed", () => {
    near(negBinomTail(10, 3, 3).pValue, poissonTail(10, 3).pValue, 1e-9);
  });
  it("robust z flags an outlier the mean-based z would mask", () => {
    const base = [2, 3, 2, 3, 2, 3, 2, 3];
    expect(robustZ(20, base)).toBeGreaterThan(5);
  });
});

describe("two-proportion test", () => {
  it("30/100 vs 20/100 → z ≈ 1.63, p ≈ 0.10", () => {
    const r = twoProportionTest(30, 100, 20, 100);
    near(r.statistic, 1.633, 0.02);
    near(r.pValue, 0.1025, 0.01);
  });
});

describe("mann-whitney U", () => {
  it("known small sample U", () => {
    // a clearly-separated pair: all of b below all of a → U = 0, p small
    const r = mannWhitneyU([6, 7, 8, 9], [1, 2, 3, 4]);
    expect(r.statistic).toBe(0);
    expect(r.pValue).toBeLessThan(0.05);
    near(Math.abs(r.effectSize), 1, 1e-9); // full separation
  });
});

describe("chi-square independence", () => {
  it("a 2×2 with strong association is significant", () => {
    const r = chiSquareTest([
      [90, 10],
      [10, 90],
    ]);
    expect(r.pValue).toBeLessThan(1e-6);
    expect(r.effectSize).toBeGreaterThan(0.5); // large Cramér's V
  });
  it("an independent table is not significant", () => {
    const r = chiSquareTest([
      [50, 50],
      [50, 50],
    ]);
    near(r.statistic, 0, 1e-9);
    near(r.pValue, 1, 1e-9);
  });
});

describe("Benjamini–Hochberg FDR", () => {
  it("adjusts and preserves input order (monotone q-values)", () => {
    const q = benjaminiHochberg([0.001, 0.008, 0.039, 0.041, 0.9]);
    // classic BH example: first stays tiny, last stays ~1
    near(q[0], 0.005, 1e-3);
    expect(q[4]).toBeCloseTo(0.9, 5);
    // q-values are non-decreasing in the sorted p order
    expect(q[0]).toBeLessThanOrEqual(q[1]);
    expect(q[1]).toBeLessThanOrEqual(q[2]);
  });
  it("empty input → empty output", () => {
    expect(benjaminiHochberg([])).toEqual([]);
  });
});
