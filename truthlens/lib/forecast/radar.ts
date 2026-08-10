// lib/forecast/radar.ts - Predictive Forecasting · Early-Warning Radar.
//
// An actuarial (hazard-model) forecaster that turns a narrative's recent signal
// history into a forward-looking risk of ESCALATION within a horizon, so the
// monitoring loop can pre-empt the next wave instead of only reacting to it.
//
// It is a FORECAST, held to the same frozen rules as every other output:
//   - BAND + probability + confidence + evidence + an explicit alternative
//     (rule 3). A forecast is never a verdict and never names a person (rule 1).
//   - Below the data floor → Unknown, no forecast (rule 4) - never a guess.
//   - Deterministic + pure: same history → same forecast (rule 8). Scores are
//     computed in TypeScript, never by a model.
//
// The model is a transparent logistic hazard: fixed, interpretable weights over
// leading indicators drawn from the tested analysis layer (level anomaly, growth
// diffusion, change-point, count-spike tail, tone deterioration). Each
// indicator's signed log-odds contribution is reported for the audit trail. The
// upgrade path to empirical calibration is lib/analysis/conformal.

import { robustZ, poissonTail, describe } from "@/lib/analysis/stats";
import { fitExponential, changePoint, CHANGEPOINT_MIN_POINTS } from "@/lib/analysis/dynamics";
import { estimativeLanguage } from "@/lib/analysis/evidence";

export const RADAR_VERSION = "forecast-radar-v1";

/** Minimum history before any forecast is issued (baseline + a trend need room). */
export const RADAR_MIN_POINTS = 8;
export const HORIZON_DAYS_DEFAULT = 7;

/** Hazard-probability cut points for the early-warning bands (named exports). */
export const BAND_THRESHOLDS = { watch: 0.25, elevated: 0.5, warning: 0.75 } as const;

/** Fixed, interpretable hazard weights (log-odds). Documented, not learned -
 * conformal calibration (lib/analysis/conformal) is the empirical upgrade path. */
export const HAZARD_WEIGHTS = {
  intercept: -1.15, // base rate: escalation is the exception, not the default
  level: 0.55, // recent level anomaly (robust z), capped
  growth: 1.30, // exponential diffusion of volume
  changePoint: 1.15, // a recent upward regime shift
  spike: 0.95, // latest count beyond the Poisson expectation
  tone: 0.70, // deteriorating (more negative) tone
} as const;

/** Max points the forecast may move a risk score, scaled by hazard × confidence. */
export const RESCORE_MAX_DELTA = 20;

export type RadarBand = "Calm" | "Watch" | "Elevated" | "Warning" | "Unknown";

export interface RadarSeries {
  date?: string;
  value: number;
}

export interface RadarInput {
  /** Volume/attention over time (oldest→newest). The primary signal. */
  volume: RadarSeries[];
  /** Optional tone series (oldest→newest); more negative = harsher coverage. */
  tone?: RadarSeries[];
  horizonDays?: number;
}

export interface LeadingIndicator {
  key: "level" | "growth" | "changePoint" | "spike" | "tone";
  label: string;
  /** Signed log-odds contribution to the hazard (0 = not contributing). */
  contribution: number;
  detail: string;
}

export interface RadarForecast {
  available: boolean;
  reason?: string;
  band: RadarBand;
  /** Probability of escalation within the horizon (0–1). */
  hazard: number;
  horizonDays: number;
  confidence: "Low" | "Medium" | "High" | "Unknown";
  indicators: LeadingIndicator[];
  evidence: string[];
  alternative: string;
  /** ICD-203 estimative-language phrasing of the hazard. */
  estimative?: string;
  version: string;
}

const UNAVAILABLE = (reason: string): RadarForecast => ({
  available: false,
  reason,
  band: "Unknown",
  hazard: 0,
  horizonDays: HORIZON_DAYS_DEFAULT,
  confidence: "Unknown",
  indicators: [],
  evidence: [],
  alternative: "",
  version: RADAR_VERSION,
});

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

const ALTERNATIVE =
  "An organic news cycle, a single real-world event, or seasonality can drive the same rise without any coordinated campaign - a forecast is a prompt to watch, not proof that an operation is under way.";

/**
 * Forecast the risk of narrative escalation within the horizon from recent
 * signal history. Pure + deterministic. Returns Unknown below the data floor.
 */
export function forecastNarrativeRisk(input: RadarInput): RadarForecast {
  const horizonDays = input.horizonDays && input.horizonDays > 0 ? Math.round(input.horizonDays) : HORIZON_DAYS_DEFAULT;
  const vol = (input.volume || []).map((p) => Number(p.value)).filter((v) => isFinite(v));
  if (vol.length < RADAR_MIN_POINTS) {
    return { ...UNAVAILABLE(`Need >= ${RADAR_MIN_POINTS} history points to forecast, got ${vol.length}.`), horizonDays };
  }

  const indicators: LeadingIndicator[] = [];
  const evidence: string[] = [];
  let logit = HAZARD_WEIGHTS.intercept;
  const agree: number[] = []; // signed indicator directions, for confidence

  // Split into a baseline history and the most-recent window.
  const win = Math.max(2, Math.min(7, Math.floor(vol.length / 3)));
  const recent = vol.slice(-win);
  const history = vol.slice(0, -1); // everything up to (not incl.) the latest point
  const latest = vol[vol.length - 1];
  const baseline = describe(vol.slice(0, Math.max(1, vol.length - win)));

  // 1) Level anomaly - how extreme is the recent window vs the whole history.
  const recentMean = recent.reduce((s, v) => s + v, 0) / recent.length;
  const rz = clamp(robustZ(recentMean, history), -4, 4);
  if (isFinite(rz) && Math.abs(rz) > 0.5) {
    const c = HAZARD_WEIGHTS.level * clamp(rz / 3, -1, 1);
    logit += c;
    agree.push(Math.sign(c));
    indicators.push({ key: "level", label: "Recent level vs baseline", contribution: c, detail: `Recent window is ${rz > 0 ? "" : "below "}${Math.abs(rz).toFixed(1)}σ (robust) ${rz > 0 ? "above" : "under"} the baseline.` });
  }

  // 2) Growth - exponential diffusion of volume (a doubling curve is the classic
  //    pre-escalation signature). Weighted by fit quality.
  const t = vol.map((_, i) => i);
  const fit = fitExponential(t, vol);
  if (!fit.insufficient && fit.rate > 0 && fit.r2 > 0.3) {
    const strength = clamp(fit.rate * 3, 0, 1) * clamp(fit.r2, 0, 1);
    const c = HAZARD_WEIGHTS.growth * strength;
    logit += c;
    agree.push(1);
    indicators.push({ key: "growth", label: "Volume growth", contribution: c, detail: `Exponential fit r²=${fit.r2.toFixed(2)}${fit.doublingTime ? `, doubling ~${fit.doublingTime.toFixed(1)} steps` : ""}.` });
  } else if (!fit.insufficient && fit.rate < 0 && fit.r2 > 0.3) {
    const c = -HAZARD_WEIGHTS.growth * clamp(-fit.rate * 3, 0, 1) * clamp(fit.r2, 0, 1) * 0.5;
    logit += c;
    agree.push(-1);
    indicators.push({ key: "growth", label: "Volume decay", contribution: c, detail: `Declining trend (r²=${fit.r2.toFixed(2)}) - cooling, not building.` });
  }

  // 3) Change-point - a recent upward regime shift is a strong leading signal.
  //    Direction is the mean after the break minus the mean before it.
  if (vol.length >= CHANGEPOINT_MIN_POINTS) {
    const cp = changePoint(vol);
    if (cp.detected && cp.index != null && cp.index > 0 && cp.index < vol.length) {
      const before = vol.slice(0, cp.index);
      const after = vol.slice(cp.index);
      const meanBefore = before.reduce((s, v) => s + v, 0) / before.length;
      const meanAfter = after.reduce((s, v) => s + v, 0) / after.length;
      const deltaMean = meanAfter - meanBefore;
      const recencyFrac = cp.index / vol.length; // later = more recent
      if (deltaMean > 0 && recencyFrac >= 0.5) {
        const c = HAZARD_WEIGHTS.changePoint * clamp(recencyFrac, 0, 1);
        logit += c;
        agree.push(1);
        indicators.push({ key: "changePoint", label: "Recent upward shift", contribution: c, detail: `Upward regime change at ~${Math.round(recencyFrac * 100)}% into the window (Δmean +${deltaMean.toFixed(1)}).` });
      }
    }
  }

  // 4) Spike - is the latest point beyond what the baseline Poisson rate expects.
  const lambda = Math.max(0.5, baseline.mean);
  if (latest > lambda) {
    const tail = poissonTail(Math.round(latest), lambda);
    if (tail.pValue < 0.1) {
      const c = HAZARD_WEIGHTS.spike * clamp(1 - tail.pValue / 0.1, 0, 1);
      logit += c;
      agree.push(1);
      indicators.push({ key: "spike", label: "Latest-point spike", contribution: c, detail: `Latest value ${Math.round(latest)} vs expected ~${lambda.toFixed(1)} (Poisson tail p=${tail.pValue.toFixed(3)}).` });
    }
  }

  // 5) Tone deterioration - recent tone more negative than the earlier baseline.
  const tone = (input.tone || []).map((p) => Number(p.value)).filter((v) => isFinite(v));
  if (tone.length >= RADAR_MIN_POINTS) {
    const tw = Math.max(2, Math.min(7, Math.floor(tone.length / 3)));
    const recentTone = tone.slice(-tw).reduce((s, v) => s + v, 0) / tw;
    const priorTone = tone.slice(0, -tw).reduce((s, v) => s + v, 0) / Math.max(1, tone.length - tw);
    const drop = priorTone - recentTone; // positive = tone got more negative
    if (Math.abs(drop) > 0.5) {
      const c = HAZARD_WEIGHTS.tone * clamp(drop / 3, -1, 1);
      logit += c;
      agree.push(Math.sign(c));
      indicators.push({ key: "tone", label: "Tone shift", contribution: c, detail: `Recent tone ${drop > 0 ? "harsher" : "softer"} by ${Math.abs(drop).toFixed(1)} vs baseline.` });
    }
  }

  const hazard = sigmoid(logit);
  const band: RadarBand =
    hazard >= BAND_THRESHOLDS.warning ? "Warning" :
    hazard >= BAND_THRESHOLDS.elevated ? "Elevated" :
    hazard >= BAND_THRESHOLDS.watch ? "Watch" : "Calm";

  // Confidence: data sufficiency × indicator agreement (aligned signals raise it,
  // conflicting ones lower it). Never "High" on a thin or contradictory picture.
  const dataScore = clamp((vol.length - RADAR_MIN_POINTS) / 20, 0, 1); // saturates ~28 pts
  const posShare = agree.length ? agree.filter((s) => s > 0).length / agree.length : 0;
  const agreement = agree.length ? Math.abs(posShare - 0.5) * 2 : 0; // 0 mixed → 1 unanimous
  const confScore = dataScore * (0.4 + 0.6 * agreement);
  const confidence: RadarForecast["confidence"] =
    indicators.length === 0 ? "Low" :
    confScore > 0.66 ? "High" : confScore > 0.33 ? "Medium" : "Low";

  evidence.push(`${indicators.length} leading indicator${indicators.length === 1 ? "" : "s"} over ${vol.length} history points; horizon ${horizonDays}d.`);
  if (band === "Calm") evidence.push("No escalation signature dominates right now - the quiet-period baseline is itself the finding, and it is logged.");

  return {
    available: true,
    band,
    hazard,
    horizonDays,
    confidence,
    indicators: indicators.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    evidence,
    alternative: ALTERNATIVE,
    estimative: estimativeLanguage(hazard).word,
    version: RADAR_VERSION,
  };
}

export interface ReScore {
  score: number; // updated 0–100 risk score
  delta: number; // signed change applied by the forecast
  rationale: string;
}

/**
 * Feed the forecast back into a risk score. The forecast can RAISE the score
 * early (warning ahead of the wave) or gently relax it in a sustained calm -
 * bounded by RESCORE_MAX_DELTA and scaled by confidence, so a thin forecast
 * barely moves the number. Fully reversible and labelled as forecast-driven.
 */
export function reScoreRisk(baseScore: number, f: RadarForecast): ReScore {
  if (!f.available) return { score: baseScore, delta: 0, rationale: "No forecast available - risk score unchanged." };
  const confW = f.confidence === "High" ? 1 : f.confidence === "Medium" ? 0.6 : 0.3;
  const delta = Math.round((f.hazard - 0.5) * 2 * RESCORE_MAX_DELTA * confW);
  const score = clamp(baseScore + delta, 0, 100);
  const dir = delta > 0 ? "raised" : delta < 0 ? "eased" : "held";
  return {
    score,
    delta: score - baseScore,
    rationale: `Forecast (${f.band}, ${f.estimative}) ${dir} the risk score by ${Math.abs(score - baseScore)} at ${f.confidence} confidence - reversible, recomputed each cycle.`,
  };
}

/**
 * Exponentially-weighted baseline update - the "loop tightening" across Report &
 * Renewal cycles. Each cycle folds the latest observation into the running
 * baseline so the detector adapts to a shifting normal instead of drifting.
 */
export function updateBaseline(prevBaseline: number | null, latest: number, alpha = 0.3): number {
  if (prevBaseline == null || !isFinite(prevBaseline)) return latest;
  return alpha * latest + (1 - alpha) * prevBaseline;
}
