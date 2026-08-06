// lib/analysis/conformal.ts — split-conformal calibration (distribution-free).
//
// Turns "confidence: High" from a hand-tuned rubric into a claim with a FINITE-
// SAMPLE mathematical guarantee: given n calibration scores from cases with a
// KNOWN outcome, the conformal quantile bounds the error rate of future flags
// at alpha - with NO distributional assumption beyond exchangeability
// (Vovk et al.; Angelopoulos & Bates 2023). Almost no OSINT product does this.
//
// Honesty gates (frozen rules):
//   - below CONFORMAL_MIN_CALIBRATION labeled cases → null ("Unknown is a valid
//     answer"), never a guarantee we cannot back (rule 4/7);
//   - the guarantee text always names alpha and n — a coverage claim without
//     its sample size is an overclaim;
//   - pure TypeScript, deterministic, testable (scores are never model-made).
//
// This is a LIBRARY layer: it activates wherever the operator has outcome-
// labeled history (e.g. reviewed alerts marked true/false positive). Callers
// without labeled outcomes must pass nothing and render "not calibrated".

export const CONFORMAL_VERSION = "analysis-conformal-v1";

/** Minimum labeled calibration cases before any guarantee is issued. Below
 * this, finite-sample correction makes the bound vacuous anyway. */
export const CONFORMAL_MIN_CALIBRATION = 20;

export interface ConformalBand {
  version: string;
  /** Flag scores STRICTLY ABOVE this threshold. */
  threshold: number;
  /** Target false-alarm bound (e.g. 0.1). */
  alpha: number;
  /** Calibration sample size behind the guarantee. */
  n: number;
  /** Human-readable, honest statement of exactly what is guaranteed. */
  guarantee: string;
}

/**
 * Finite-sample conformal quantile: the k-th smallest value with
 * k = ceil((n+1)(1-alpha)). Returns null when n is too small for the requested
 * alpha (k > n) — no guarantee is possible, and we say so instead of clamping.
 */
export function conformalQuantile(scores: number[], alpha: number): number | null {
  const n = scores.length;
  if (n === 0 || !(alpha > 0 && alpha < 1)) return null;
  const k = Math.ceil((n + 1) * (1 - alpha));
  if (k > n) return null; // not enough data to certify this alpha
  const sorted = [...scores].sort((a, b) => a - b);
  return sorted[k - 1];
}

/**
 * Conformal p-value of a new score against calibration scores drawn from the
 * NULL population (e.g. innocent/benign cases): the probability, under
 * exchangeability, of seeing a score at least this extreme. Ranges (0, 1];
 * includes the +1 smoothing so it is valid at any n. Null when no calibration.
 */
export function conformalPValue(nullScores: number[], score: number): number | null {
  const n = nullScores.length;
  if (n === 0 || !isFinite(score)) return null;
  let ge = 0;
  for (const s of nullScores) if (s >= score) ge++;
  return (ge + 1) / (n + 1);
}

/**
 * Calibrated alert threshold from scores of KNOWN-BENIGN cases: flagging only
 * scores above the returned threshold keeps the false-alarm rate ≤ alpha,
 * guaranteed in finite samples (assuming future benign cases are exchangeable
 * with the calibration set). Returns null below the calibration floor —
 * "not calibrated" is rendered, never a fake guarantee.
 */
export function conformalThreshold(benignScores: number[], alpha = 0.1): ConformalBand | null {
  const clean = benignScores.filter((s) => isFinite(s));
  if (clean.length < CONFORMAL_MIN_CALIBRATION) return null;
  const threshold = conformalQuantile(clean, alpha);
  if (threshold == null) return null;
  return {
    version: CONFORMAL_VERSION,
    threshold,
    alpha,
    n: clean.length,
    guarantee:
      `Flagging scores above ${round3(threshold)} bounds the false-alarm rate at ` +
      `${Math.round(alpha * 100)}% (finite-sample conformal guarantee from ${clean.length} ` +
      `reviewed benign cases; assumes future cases are exchangeable with them).`,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
