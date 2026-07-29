// lib/analysis/dynamics.ts — spread & time-series (the "physicist").
//
// Turns a chronological propagation/volume trace into modeled dynamics, each with a
// fit-quality figure and an explicit `insufficient` flag below its data floor — a
// three-point "trend" is a defect, not a result. Distinguishes the core physics of
// an influence campaign (externally injected / self-exciting) from an organic event.
//
// Pure, deterministic (seeded PRNG for the change-point bootstrap). No dependencies.
// Nothing here attributes to a person or state — it characterizes a curve.

import { mulberry32 } from "./graph";

export const DYNAMICS_VERSION = "analysis-dynamics-v1";

// Data floors — below these, a method returns `insufficient` rather than a number.
export const GROWTH_MIN_POINTS = 5;
export const HAWKES_MIN_EVENTS = 12;
export const CHANGEPOINT_MIN_POINTS = 8;
export const BURST_MIN_EVENTS = 5;

// ---------------------------------------------------------------------------
// Growth-rate estimation
// ---------------------------------------------------------------------------

export interface GrowthFit {
  insufficient: boolean;
  reason?: string;
  model: "exponential" | "logistic" | "none";
  rate: number; // b in y = a·e^{bt}
  doublingTime: number | null; // ln2 / b, when b > 0
  r2: number; // on the original scale
  n: number;
}

function r2Of(y: number[], yhat: number[]): number {
  const m = y.reduce((a, b) => a + b, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < y.length; i++) {
    ssRes += (y[i] - yhat[i]) ** 2;
    ssTot += (y[i] - m) ** 2;
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

/** Ordinary least squares slope/intercept for y ~ a + b·x. */
function ols(x: number[], y: number[]): { a: number; b: number } {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/**
 * Fit an exponential diffusion curve y = a·e^{bt} by OLS on log(y) (positive y),
 * reporting the doubling time and R² on the original scale. Returns `insufficient`
 * below GROWTH_MIN_POINTS — never a "trend" from a handful of points.
 */
export function fitExponential(t: number[], y: number[]): GrowthFit {
  const n = Math.min(t.length, y.length);
  if (n < GROWTH_MIN_POINTS) {
    return { insufficient: true, reason: `need >= ${GROWTH_MIN_POINTS} points, got ${n}`, model: "none", rate: NaN, doublingTime: null, r2: 0, n };
  }
  const xs: number[] = [];
  const ly: number[] = [];
  for (let i = 0; i < n; i++) {
    if (y[i] > 0) {
      xs.push(t[i]);
      ly.push(Math.log(y[i]));
    }
  }
  if (xs.length < GROWTH_MIN_POINTS) {
    return { insufficient: true, reason: "too many non-positive values for a log fit", model: "none", rate: NaN, doublingTime: null, r2: 0, n };
  }
  const { a, b } = ols(xs, ly);
  const yhat = t.slice(0, n).map((tt) => Math.exp(a) * Math.exp(b * tt));
  return { insufficient: false, model: "exponential", rate: b, doublingTime: b > 0 ? Math.LN2 / b : null, r2: r2Of(y.slice(0, n), yhat), n };
}

/**
 * Logistic fit with carrying capacity K (defaults to slightly above the observed
 * max): linearize ln(y/(K−y)) = ln(a) + b·t and OLS. Reports R² on the original
 * scale. Below the data floor → `insufficient`.
 */
export function fitLogistic(t: number[], y: number[], K?: number): GrowthFit {
  const n = Math.min(t.length, y.length);
  if (n < GROWTH_MIN_POINTS) {
    return { insufficient: true, reason: `need >= ${GROWTH_MIN_POINTS} points, got ${n}`, model: "none", rate: NaN, doublingTime: null, r2: 0, n };
  }
  const cap = K ?? Math.max(...y.slice(0, n)) * 1.1 + 1e-9;
  const xs: number[] = [];
  const ly: number[] = [];
  for (let i = 0; i < n; i++) {
    const yi = y[i];
    if (yi > 0 && yi < cap) {
      xs.push(t[i]);
      ly.push(Math.log(yi / (cap - yi)));
    }
  }
  if (xs.length < GROWTH_MIN_POINTS) {
    return { insufficient: true, reason: "not enough interior points for a logistic fit", model: "none", rate: NaN, doublingTime: null, r2: 0, n };
  }
  const { a, b } = ols(xs, ly);
  const yhat = t.slice(0, n).map((tt) => cap / (1 + Math.exp(-(a + b * tt))));
  return { insufficient: false, model: "logistic", rate: b, doublingTime: b > 0 ? Math.LN2 / b : null, r2: r2Of(y.slice(0, n), yhat), n };
}

// ---------------------------------------------------------------------------
// Burstiness & inter-event times
// ---------------------------------------------------------------------------

export interface Burstiness {
  insufficient: boolean;
  reason?: string;
  fano: number; // variance/mean of counts per bin (1 = Poisson, >1 = bursty)
  cv: number; // coefficient of variation of inter-event times
  burstiness: number; // Goh–Barabási B = (σ−μ)/(σ+μ) ∈ [−1,1]
  meanInterval: number;
  n: number;
}

/**
 * Burstiness of an event-time series: the Goh–Barabási parameter B on inter-event
 * times (B≈−1 regular/machine-like, B≈0 Poisson, B>0 human-bursty), the CV, and the
 * Fano factor of counts in `bins` equal-width windows. `insufficient` below floor.
 */
export function burstiness(eventTimes: number[], bins = 10): Burstiness {
  const n = eventTimes.length;
  if (n < BURST_MIN_EVENTS) {
    return { insufficient: true, reason: `need >= ${BURST_MIN_EVENTS} events, got ${n}`, fano: NaN, cv: NaN, burstiness: NaN, meanInterval: NaN, n };
  }
  const times = [...eventTimes].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  const mu = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const varr = gaps.reduce((a, b) => a + (b - mu) ** 2, 0) / gaps.length;
  const sigma = Math.sqrt(varr);
  const cv = mu > 0 ? sigma / mu : 0;
  const B = sigma + mu > 0 ? (sigma - mu) / (sigma + mu) : 0;
  // Fano factor over equal-width bins across the observed span.
  const span = times[times.length - 1] - times[0] || 1;
  const counts = new Array(bins).fill(0);
  for (const t of times) {
    const idx = Math.min(bins - 1, Math.floor(((t - times[0]) / span) * bins));
    counts[idx]++;
  }
  const cm = counts.reduce((a, b) => a + b, 0) / bins;
  const cvar = counts.reduce((a, b) => a + (b - cm) ** 2, 0) / bins;
  const fano = cm > 0 ? cvar / cm : 0;
  return { insufficient: false, fano, cv, burstiness: B, meanInterval: mu, n };
}

// ---------------------------------------------------------------------------
// Hawkes self-exciting branching ratio (EM with fixed exponential kernel)
// ---------------------------------------------------------------------------

export interface BranchingEstimate {
  insufficient: boolean;
  reason?: string;
  branchingRatio: number; // n = α/β ; <1 subcritical, ≈0 = pure background/organic
  background: number; // μ (exogenous rate)
  interpretation: "organic/exogenous" | "self-exciting" | "critical";
  n: number;
}

/**
 * Estimate a Hawkes branching ratio with an exponential kernel via EM, decay β fixed
 * from the data (β = 1/mean-gap). The branching ratio n = α/β separates
 * self-sustaining spread (n large, offspring beget offspring) from externally-driven
 * or organic arrivals (n≈0). Deterministic; `insufficient` below HAWKES_MIN_EVENTS.
 */
export function branchingRatio(eventTimes: number[], iterations = 60): BranchingEstimate {
  const n = eventTimes.length;
  if (n < HAWKES_MIN_EVENTS) {
    return { insufficient: true, reason: `need >= ${HAWKES_MIN_EVENTS} events, got ${n}`, branchingRatio: NaN, background: NaN, interpretation: "organic/exogenous", n };
  }
  const t = [...eventTimes].sort((a, b) => a - b);
  const T = t[t.length - 1] - t[0] || 1;
  const rel = t.map((x) => x - t[0]);
  let meanGap = 0;
  for (let i = 1; i < rel.length; i++) meanGap += rel[i] - rel[i - 1];
  meanGap /= rel.length - 1;
  const beta = meanGap > 0 ? 1 / meanGap : 1;

  let mu = n / T / 2;
  let alpha = beta / 2; // start subcritical
  for (let iter = 0; iter < iterations; iter++) {
    let sumPii = 0;
    let sumPij = 0;
    for (let i = 0; i < rel.length; i++) {
      let excite = 0;
      for (let j = 0; j < i; j++) excite += alpha * Math.exp(-beta * (rel[i] - rel[j]));
      const lambda = mu + excite;
      if (lambda <= 0) continue;
      sumPii += mu / lambda;
      sumPij += excite / lambda;
    }
    let integral = 0; // Σ_j (1 − e^{−β(T−t_j)})
    for (let j = 0; j < rel.length; j++) integral += 1 - Math.exp(-beta * (T - rel[j]));
    mu = sumPii / T;
    alpha = integral > 0 ? (sumPij * beta) / integral : 0;
  }
  const nRatio = alpha / beta;
  const interpretation = nRatio < 0.3 ? "organic/exogenous" : nRatio < 0.9 ? "self-exciting" : "critical";
  return { insufficient: false, branchingRatio: nRatio, background: mu, interpretation, n };
}

// ---------------------------------------------------------------------------
// Change-point detection (CUSUM + seeded bootstrap significance)
// ---------------------------------------------------------------------------

export interface ChangePoint {
  insufficient: boolean;
  reason?: string;
  index: number | null; // index in the series where the shift is earliest observed
  magnitude: number; // Sdiff = max(cusum) − min(cusum)
  pValue: number; // bootstrap significance
  detected: boolean;
  n: number;
}

function cusumRange(series: number[]): { sdiff: number; argmax: number } {
  const m = series.reduce((a, b) => a + b, 0) / series.length;
  let s = 0;
  let smin = 0;
  let smax = 0;
  let argmax = 0;
  const cusum: number[] = [];
  for (let i = 0; i < series.length; i++) {
    s += series[i] - m;
    cusum.push(s);
    if (s > smax) smax = s;
    if (s < smin) smin = s;
  }
  // change point = index of the extreme cumulative deviation
  let best = 0;
  let bestAbs = -1;
  for (let i = 0; i < cusum.length; i++) {
    if (Math.abs(cusum[i]) > bestAbs) {
      bestAbs = Math.abs(cusum[i]);
      best = i;
    }
  }
  argmax = best;
  return { sdiff: smax - smin, argmax };
}

/**
 * CUSUM change-point detection on a volume series, with a seeded bootstrap for
 * significance (fraction of shuffles whose CUSUM range >= observed). The detected
 * index is labeled *earliest observed in collected data* by callers (rule 2), never
 * "the true start". `insufficient` below CHANGEPOINT_MIN_POINTS.
 */
export function changePoint(series: number[], seed = 1, bootstraps = 500, alpha = 0.05): ChangePoint {
  const n = series.length;
  if (n < CHANGEPOINT_MIN_POINTS) {
    return { insufficient: true, reason: `need >= ${CHANGEPOINT_MIN_POINTS} points, got ${n}`, index: null, magnitude: NaN, pValue: 1, detected: false, n };
  }
  const { sdiff, argmax } = cusumRange(series);
  const rng = mulberry32(seed);
  let ge = 1;
  for (let b = 0; b < bootstraps; b++) {
    const shuffled = [...series];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (cusumRange(shuffled).sdiff >= sdiff) ge++;
  }
  const p = ge / (bootstraps + 1);
  return { insufficient: false, index: argmax, magnitude: sdiff, pValue: p, detected: p < alpha, n };
}
