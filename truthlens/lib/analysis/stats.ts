// lib/analysis/stats.ts — statistical inference primitives (the "mathematician").
//
// The governing rule of this whole layer: every quantity carries its uncertainty,
// and fabricated precision is a bug. So each estimator here returns the estimate
// AND its uncertainty (a confidence interval, or a p-value + n) — never a bare
// point value. Small samples produce WIDE intervals, not confident-looking numbers;
// that is the correct behavior, not a limitation.
//
// Pure, deterministic, no dependencies. Formulas are the textbook/standard methods,
// cited inline. Validated against hand-computed values in stats.test.ts.
//
// This module never identifies a person or an actor — it quantifies rates,
// differences, spikes and over-representation. Attribution stays forbidden by the
// project rules regardless of how strong a statistic is.

export const STATS_VERSION = "analysis-stats-v1";

// ----------------------------------------------------------------------------
// Special functions (Numerical Recipes / Abramowitz & Stegun)
// ----------------------------------------------------------------------------

/** log Γ(x) via the Lanczos approximation (g=7, n=9). */
export function gammaln(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < c.length; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** error function erf(x) — Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

/** Standard normal CDF Φ(z). */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Inverse standard normal CDF (Acklam's algorithm; |error| < 1.15e-9). */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * Student-t two-sided quantile via the Cornish–Fisher expansion of the normal
 * quantile (Abramowitz & Stegun 26.7.5). Accurate to ~3 decimals for df >= 3; the
 * normal limit is recovered as df -> ∞.
 */
export function studentTInv(p: number, df: number): number {
  if (df >= 1e6) return normalInv(p);
  const z = normalInv(p);
  const z2 = z * z;
  const g1 = (z2 * z + z) / 4;
  const g2 = (5 * z2 * z2 * z + 16 * z2 * z + 3 * z) / 96;
  const g3 = (3 * z2 * z2 * z2 * z + 19 * z2 * z2 * z + 17 * z2 * z - 15 * z) / 384;
  const g4 = (79 * z2 ** 4 * z + 776 * z2 ** 3 * z + 1482 * z2 * z2 * z - 1920 * z2 * z - 945 * z) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

/** Regularized lower incomplete gamma P(a,x) (series + continued fraction). */
export function gammp(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // series representation
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 200; n++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  // continued fraction for Q, then P = 1 - Q
  const tiny = 1e-30;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  return 1 - q;
}

/** Chi-square CDF with k degrees of freedom. */
export function chiSquareCdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return gammp(k / 2, x / 2);
}

// ----------------------------------------------------------------------------
// Descriptive statistics (mean-only is not enough; robust variants included)
// ----------------------------------------------------------------------------

export interface Describe {
  n: number;
  mean: number;
  median: number;
  variance: number; // sample variance (n-1)
  sd: number;
  mad: number; // median absolute deviation, scaled ×1.4826 (≈ robust SD)
  iqr: number;
  q1: number;
  q3: number;
  skew: number; // sample skewness (g1)
  min: number;
  max: number;
}

function sorted(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

/** Linear-interpolation quantile (type-7, the R/NumPy default). */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = sorted(xs);
  if (s.length === 1) return s[0];
  const h = (s.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]): number {
  return quantile(xs, 0.5);
}

export function describe(xs: number[]): Describe {
  const n = xs.length;
  const m = mean(xs);
  const med = median(xs);
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) : NaN;
  const sd = Math.sqrt(variance);
  const absDev = xs.map((x) => Math.abs(x - med));
  const mad = median(absDev) * 1.4826;
  const q1 = quantile(xs, 0.25);
  const q3 = quantile(xs, 0.75);
  // sample skewness g1
  let skew = NaN;
  if (n > 2 && sd > 0) {
    const m3 = xs.reduce((a, b) => a + (b - m) ** 3, 0) / n;
    const s3 = (xs.reduce((a, b) => a + (b - m) ** 2, 0) / n) ** 1.5;
    skew = s3 > 0 ? m3 / s3 : NaN;
  }
  return { n, mean: m, median: med, variance, sd, mad, iqr: q3 - q1, q1, q3, skew, min: Math.min(...xs), max: Math.max(...xs) };
}

// ----------------------------------------------------------------------------
// Confidence intervals
// ----------------------------------------------------------------------------

export interface Interval {
  point: number;
  lower: number;
  upper: number;
  n: number;
  level: number; // e.g. 0.95
  method: string;
}

/**
 * Wilson score interval for a binomial proportion — the correct interval for
 * "X% of accounts are …" claims on small samples (the naive Wald interval is
 * badly wrong for small n or extreme p). Returns a WIDE interval when n is small
 * — that width IS the uncertainty and must be shown.
 */
export function wilsonInterval(successes: number, n: number, level = 0.95): Interval {
  const p = n > 0 ? successes / n : NaN;
  if (n === 0) return { point: NaN, lower: 0, upper: 1, n, level, method: "wilson" };
  const z = normalInv(1 - (1 - level) / 2);
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { point: p, lower: Math.max(0, center - half), upper: Math.min(1, center + half), n, level, method: "wilson" };
}

/** t-interval for a mean (unknown variance). Returns Insufficient-width for n<2. */
export function tInterval(xs: number[], level = 0.95): Interval {
  const n = xs.length;
  const m = mean(xs);
  if (n < 2) return { point: m, lower: -Infinity, upper: Infinity, n, level, method: "t-interval" };
  const sd = describe(xs).sd;
  const t = studentTInv(1 - (1 - level) / 2, n - 1);
  const half = t * (sd / Math.sqrt(n));
  return { point: m, lower: m - half, upper: m + half, n, level, method: "t-interval" };
}

// ----------------------------------------------------------------------------
// Anomaly / spike detection
// ----------------------------------------------------------------------------

/** Classic z-score of x against a sample (Gaussian assumption). */
export function zScore(x: number, xs: number[]): number {
  const d = describe(xs);
  return d.sd > 0 ? (x - d.mean) / d.sd : 0;
}

/** Robust z-score using median and MAD — resistant to the very outliers we hunt. */
export function robustZ(x: number, xs: number[]): number {
  const d = describe(xs);
  return d.mad > 0 ? (x - d.median) / d.mad : 0;
}

export interface TailTest {
  pValue: number;
  observed: number;
  expected: number;
  method: string;
}

/**
 * Poisson upper-tail test P(X >= k | λ) for a COUNT spike. Mention/post volumes are
 * counts, not Gaussian — a z-score on raw low counts overstates significance. Uses
 * the identity P(X>=k;λ) = gammp(k, λ) (regularized lower incomplete gamma).
 */
export function poissonTail(k: number, lambda: number): TailTest {
  if (lambda <= 0) return { pValue: k > 0 ? 0 : 1, observed: k, expected: lambda, method: "poisson-tail" };
  if (k <= 0) return { pValue: 1, observed: k, expected: lambda, method: "poisson-tail" };
  return { pValue: Math.min(1, Math.max(0, gammp(k, lambda))), observed: k, expected: lambda, method: "poisson-tail" };
}

/**
 * Negative-binomial upper tail for OVERDISPERSED counts (variance > mean), which
 * real volume series usually are — Poisson then under-states the p-value. `size`
 * (r) is the dispersion parameter estimated from mean m and variance v as
 * r = m²/(v−m); as v→m this converges to the Poisson tail.
 */
export function negBinomTail(k: number, m: number, v: number): TailTest {
  if (!(v > m) || m <= 0) return poissonTail(k, m); // not overdispersed -> Poisson
  const r = (m * m) / (v - m);
  const p = r / (r + m); // P(success)
  if (k <= 0) return { pValue: 1, observed: k, expected: m, method: "negbinom-tail" };
  // P(X >= k) = 1 - sum_{i=0}^{k-1} pmf(i)
  let cdf = 0;
  for (let i = 0; i < k; i++) {
    const logPmf = gammaln(i + r) - gammaln(i + 1) - gammaln(r) + r * Math.log(p) + i * Math.log(1 - p);
    cdf += Math.exp(logPmf);
  }
  return { pValue: Math.min(1, Math.max(0, 1 - cdf)), observed: k, expected: m, method: "negbinom-tail" };
}

// ----------------------------------------------------------------------------
// Hypothesis tests (each returns p-value + effect size + n)
// ----------------------------------------------------------------------------

export interface TestResult {
  statistic: number;
  pValue: number;
  effectSize: number;
  effectName: string;
  n: number;
  method: string;
}

/** Two-proportion z-test (two-sided) with Cohen's h effect size. */
export function twoProportionTest(k1: number, n1: number, k2: number, n2: number): TestResult {
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const pPool = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  const z = se > 0 ? (p1 - p2) / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const h = 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2)); // Cohen's h
  return { statistic: z, pValue, effectSize: h, effectName: "Cohen's h", n: n1 + n2, method: "two-proportion-z" };
}

/**
 * Mann–Whitney U (Wilcoxon rank-sum), non-parametric — the right test for skewed
 * engagement distributions where a t-test's normality assumption fails. Normal
 * approximation with tie correction; rank-biserial correlation as effect size.
 */
export function mannWhitneyU(a: number[], b: number[]): TestResult {
  const n1 = a.length;
  const n2 = b.length;
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  // average ranks with ties
  const ranks = new Array(all.length);
  let i = 0;
  const tieGroups: number[] = [];
  while (i < all.length) {
    let j = i;
    while (j < all.length - 1 && all[j + 1].v === all[i].v) j++;
    const avg = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k++) ranks[k] = avg;
    tieGroups.push(j - i + 1);
    i = j + 1;
  }
  let r1 = 0;
  for (let k = 0; k < all.length; k++) if (all[k].g === 0) r1 += ranks[k];
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const mu = (n1 * n2) / 2;
  const N = n1 + n2;
  const tieTerm = tieGroups.reduce((s, t) => s + (t * t * t - t), 0);
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1))));
  const z = sigma > 0 ? (u - mu) / sigma : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const rb = 1 - (2 * u) / (n1 * n2); // rank-biserial correlation
  return { statistic: u, pValue, effectSize: rb, effectName: "rank-biserial r", n: N, method: "mann-whitney-u" };
}

/** Pearson chi-square test of independence on an r×c contingency table; Cramér's V. */
export function chiSquareTest(table: number[][]): TestResult {
  const rows = table.length;
  const cols = table[0].length;
  const rowSums = table.map((r) => r.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: cols }, (_, j) => table.reduce((a, r) => a + r[j], 0));
  const total = rowSums.reduce((a, b) => a + b, 0);
  let chi2 = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = (rowSums[r] * colSums[c]) / total;
      if (e > 0) chi2 += (table[r][c] - e) ** 2 / e;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const pValue = 1 - chiSquareCdf(chi2, df);
  const v = Math.sqrt(chi2 / (total * Math.min(rows - 1, cols - 1))); // Cramér's V
  return { statistic: chi2, pValue, effectSize: v, effectName: "Cramér's V", n: total, method: "chi-square" };
}

// ----------------------------------------------------------------------------
// Multiple-comparison correction
// ----------------------------------------------------------------------------

/**
 * Benjamini–Hochberg FDR adjustment. When many indicators/accounts are tested at
 * once, raw p-values overstate significance; BH returns monotone q-values that
 * control the false-discovery rate. Order of the input is preserved in the output.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  const idx = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(m);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = idx[rank - 1];
    const adj = Math.min(prev, (p * m) / rank);
    q[i] = Math.min(1, adj);
    prev = q[i];
  }
  return q;
}
