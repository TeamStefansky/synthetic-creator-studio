// lib/analysis/integrate.ts — the ONE place the scorers meet the analysis layer.
//
// Holds the mapping constants/priors and the small adapters that route existing
// scorers through stats/graph/dynamics/evidence, so no scorer hard-codes the
// band mapping or the LR scale. Every result here is ADDITIVE: it annotates a
// scorer's existing conclusion with a calibrated posterior / significance /
// sensitivity — it never replaces the scorer's public score or level.
//
// The math yields confidence on a hypothesis (coordination/authenticity) only —
// never a posterior identifying a person or state (frozen rules).

import { combineEvidence, type EvidenceItem } from "./evidence";
import { changePoint, fitExponential } from "./dynamics";

export const INTEGRATE_VERSION = "analysis-integrate-v1";

// Log-likelihood-ratio scale for turning a 0–100 indicator (with its confidence)
// into evidence: a max-score, max-confidence indicator contributes ≈ LR_SCALE/2
// nats of log-odds. Documented prior, kept in one place.
export const LR_SCALE = 2.5;

/** Compact, serializable analysis annotation attached to a scorer's result. */
export interface QuantAnalysis {
  method: string;
  version: string;
  posterior?: number; // calibrated P(hypothesis) from Bayesian combination
  band?: string; // Insufficient | Low | Moderate | High
  /** IC/Graphika estimative-language word for the posterior (e.g. "Likely"). */
  estimative?: string;
  information?: number; // total evidence information (nats)
  sensitivity?: { mostInfluential: string | null; delta: number; flips: boolean };
  dynamics?: {
    growthRate?: number;
    doublingTime?: number | null;
    r2?: number;
    changePointIndex?: number | null;
    changePointP?: number;
    insufficient?: boolean;
    note?: string;
  };
}

export interface ScoredIndicator {
  key: string;
  score: number; // 0..100
  confidence: number; // 0..1
  level: string; // "Unknown" excluded by the caller
}

/**
 * Bayesian calibration of a set of 0–100 weighted indicators into a posterior with
 * a band and a sensitivity flag — a parallel, auditable view of the same signals
 * the weighted sum uses. The headline score/status stays the scorer's own; this is
 * the "how confident, and does it rest on one signal?" annotation.
 *
 * `correlatedGroups` maps an indicator key to a dependence group so signals derived
 * from the same underlying fact aren't counted as independent confirmations.
 */
export function bayesianCalibration(
  indicators: ScoredIndicator[],
  weights: Record<string, number>,
  correlatedGroups: Record<string, string> = {},
): QuantAnalysis {
  const maxW = Math.max(1, ...Object.values(weights));
  const items: EvidenceItem[] = indicators
    .filter((i) => i.level !== "Unknown")
    .map((i) => {
      const w = (weights[i.key] ?? 0) / maxW;
      const lr = Math.exp(LR_SCALE * (i.score / 100 - 0.5) * i.confidence);
      return { id: i.key, lr, weight: w, group: correlatedGroups[i.key] };
    });
  const r = combineEvidence(items, 0.5);
  return {
    method: "Bayesian log-odds combination of the indicators (parallel to the weighted score); dependence-attenuated; sensitivity = the indicator whose removal moves the posterior most.",
    version: INTEGRATE_VERSION,
    posterior: r.posterior,
    band: r.band,
    estimative: r.estimative?.word,
    information: r.information,
    sensitivity: { mostInfluential: r.sensitivity.mostInfluential, delta: r.sensitivity.delta, flips: r.sensitivity.flipsBand },
  };
}

/**
 * Model a propagation/volume timeline (event timestamps in ms) as dynamics: an
 * exponential growth fit (doubling time + R²) and a change-point (dated
 * earliest-observed, never "the true start"). Returns `insufficient` when the
 * series is too short — a handful of points is not a trend.
 */
export function timelineDynamics(timestampsMs: number[]): QuantAnalysis {
  const times = [...timestampsMs].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (times.length < 5) {
    return {
      method: "Exponential growth fit + CUSUM change-point on the volume series.",
      version: INTEGRATE_VERSION,
      dynamics: { insufficient: true, note: `Only ${times.length} dated point(s) — insufficient for a growth/change-point estimate (need ≥ 5).` },
    };
  }
  // bucket into hourly counts for a stable series
  const t0 = times[0];
  const hours = Math.max(1, Math.ceil((times[times.length - 1] - t0) / 3600000) + 1);
  const counts = new Array(Math.min(hours, 2000)).fill(0);
  for (const t of times) {
    const idx = Math.min(counts.length - 1, Math.floor((t - t0) / 3600000));
    counts[idx]++;
  }
  const x = counts.map((_, i) => i);
  const fit = fitExponential(x, counts);
  const cp = changePoint(counts, 1, 400);
  return {
    method: "Exponential growth fit (doubling time + R²) + CUSUM change-point with a seeded bootstrap; the change index is earliest-observed, not the true start.",
    version: INTEGRATE_VERSION,
    dynamics: {
      growthRate: fit.insufficient ? undefined : fit.rate,
      doublingTime: fit.insufficient ? undefined : fit.doublingTime,
      r2: fit.insufficient ? undefined : fit.r2,
      changePointIndex: cp.insufficient ? undefined : cp.detected ? cp.index : null,
      changePointP: cp.insufficient ? undefined : cp.pValue,
      insufficient: fit.insufficient && cp.insufficient,
      note: cp.detected ? `Volume dynamics shift earliest observed at bucket ${cp.index} (p=${cp.pValue.toFixed(3)}).` : undefined,
    },
  };
}

/**
 * Generic score-sensitivity for a weighted-signal scorer: which single signal, if
 * removed, drops the total most — and whether that crosses a level threshold
 * (a fragile verdict). Uses the scorer's OWN weights, not a new model.
 */
export function weightedScoreSensitivity(
  signals: { label: string; weight: number }[],
  thresholds: number[],
): { mostInfluential: string | null; delta: number; flips: boolean } {
  const total = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));
  const bandOf = (v: number) => thresholds.filter((t) => v >= t).length;
  const baseBand = bandOf(total);
  let most: string | null = null;
  let maxDelta = 0;
  let flips = false;
  for (const sig of signals) {
    const without = Math.min(100, total - sig.weight);
    const d = total - without;
    if (d > maxDelta) {
      maxDelta = d;
      most = sig.label;
      flips = bandOf(without) !== baseBand;
    }
  }
  return { mostInfluential: most, delta: maxDelta, flips };
}
