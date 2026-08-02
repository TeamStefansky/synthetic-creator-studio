// lib/analysis/evidence.ts — evidence combination (the "senior researcher").
//
// The epistemics layer that enforces "Unknown is valid" mathematically. It combines
// indicators as likelihood ratios into a posterior (log-odds, auditable), maps that
// posterior to a band via a documented VERSIONED mapping (not vibes), down-weights
// correlated indicators so several views of one fact aren't counted as independent
// confirmations, runs a sensitivity check for fragile verdicts, and returns
// `Insufficient` whenever the combined evidence doesn't clear a minimum-information
// threshold — that is how this layer produces Unknown.
//
// Pure, deterministic. It yields confidence on a HYPOTHESIS (coordination /
// authenticity) — never a posterior identifying a person or state. Attribution
// stays forbidden regardless of how strong the posterior is (frozen rules).

export const EVIDENCE_VERSION = "analysis-evidence-v1";

export type EvidenceBand = "Insufficient" | "Low" | "Moderate" | "High";

// Documented posterior→band mapping (the one source of truth; versioned so a change
// is traceable). A band means the stated probability range — nothing looser.
export const EVIDENCE_BANDS: { band: Exclude<EvidenceBand, "Insufficient">; min: number }[] = [
  { band: "High", min: 0.85 },
  { band: "Moderate", min: 0.6 },
  { band: "Low", min: 0 },
];

// Minimum total information (sum of |log-LR| contributions, in nats) below which the
// result is Insufficient regardless of the point posterior — a near-0.5 posterior
// from no real evidence must not read as "Low", it reads as Unknown.
export const INFO_FLOOR_NATS = 0.4;

// Attenuation applied to non-dominant indicators that share a dependence group:
// correlated signals from the same underlying fact contribute at this fraction.
export const DEP_ATTENUATION = 0.3;

export interface EvidenceItem {
  id: string;
  /** Likelihood ratio P(obs|H)/P(obs|¬H). >1 supports H, <1 refutes, 1 = neutral. */
  lr: number;
  /** Evidence-quality weight in [0,1] (source reliability); defaults to 1. */
  weight?: number;
  /** Dependence group: items sharing a group are treated as correlated, not independent. */
  group?: string;
}

export interface EvidenceUpdate {
  id: string;
  deltaLogOdds: number;
  posteriorAfter: number;
}

export interface Sensitivity {
  mostInfluential: string | null;
  delta: number; // change in posterior if that single item is removed
  flipsBand: boolean; // does removing it change the band? (fragile verdict)
}

export interface EvidenceResult {
  prior: number;
  posterior: number;
  logOdds: number;
  information: number; // total |contribution| in nats
  band: EvidenceBand;
  insufficient: boolean;
  /** IC/Graphika estimative-language word for the posterior (omitted when
   * Insufficient — an unknown likelihood gets no probability word). */
  estimative?: Estimative;
  updates: EvidenceUpdate[];
  sensitivity: Sensitivity;
  method: string;
  version: string;
}

// IC estimative-probability scale (ODNI ICD-203; matches Graphika's likelihood
// legend). Maps a calibrated posterior to the standard probability word so an
// assessment reads in the same vocabulary a professional intelligence report uses —
// tied to a real probability range, not a vibe.
export interface Estimative {
  word: string;
  low: number;
  high: number;
}
export const ESTIMATIVE_SCALE: Estimative[] = [
  { word: "Almost No Chance", low: 0.01, high: 0.05 },
  { word: "Very Unlikely", low: 0.05, high: 0.2 },
  { word: "Unlikely", low: 0.2, high: 0.45 },
  { word: "Roughly Even Chance", low: 0.45, high: 0.55 },
  { word: "Likely", low: 0.55, high: 0.8 },
  { word: "Very Likely", low: 0.8, high: 0.95 },
  { word: "Almost Certain", low: 0.95, high: 0.99 },
];

/** Map a probability (0–1) to its estimative-language word + range. */
export function estimativeLanguage(p: number): Estimative {
  for (const b of ESTIMATIVE_SCALE) if (p < b.high) return b;
  return ESTIMATIVE_SCALE[ESTIMATIVE_SCALE.length - 1];
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
function logit(p: number): number {
  const c = Math.min(1 - 1e-12, Math.max(1e-12, p));
  return Math.log(c / (1 - c));
}

export function bandFor(posterior: number, information: number): EvidenceBand {
  if (information < INFO_FLOOR_NATS) return "Insufficient";
  for (const { band, min } of EVIDENCE_BANDS) if (posterior >= min) return band;
  return "Low";
}

/**
 * Per-group effective contributions: within a dependence group the strongest
 * (largest |log-LR|) signal counts in full and the rest are attenuated, so N views
 * of one underlying fact don't inflate the posterior as N independent confirmations.
 * Returns the summed log-odds contribution and a per-item breakdown for the audit
 * trail (each item's already-attenuated delta).
 */
function contributions(items: EvidenceItem[]): { total: number; perItem: { id: string; delta: number }[] } {
  const groups = new Map<string, EvidenceItem[]>();
  const singles: EvidenceItem[] = [];
  for (const it of items) {
    if (it.group) {
      const g = groups.get(it.group) ?? [];
      g.push(it);
      groups.set(it.group, g);
    } else {
      singles.push(it);
    }
  }
  const perItem: { id: string; delta: number }[] = [];
  let total = 0;
  const raw = (it: EvidenceItem) => (it.weight ?? 1) * Math.log(it.lr);
  for (const it of singles) {
    const d = raw(it);
    perItem.push({ id: it.id, delta: d });
    total += d;
  }
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => Math.abs(raw(b)) - Math.abs(raw(a)));
    sorted.forEach((it, i) => {
      const d = i === 0 ? raw(it) : DEP_ATTENUATION * raw(it);
      perItem.push({ id: it.id, delta: d });
      total += d;
    });
  }
  return { total, perItem };
}

function posteriorFrom(prior: number, items: EvidenceItem[]): { posterior: number; logOdds: number; information: number; perItem: { id: string; delta: number }[] } {
  const { total, perItem } = contributions(items);
  const logOdds = logit(prior) + total;
  const information = perItem.reduce((s, p) => s + Math.abs(p.delta), 0);
  return { posterior: sigmoid(logOdds), logOdds, information, perItem };
}

/**
 * Combine indicators into a calibrated posterior with a full audit trail. `prior`
 * defaults to 0.5 (no prior belief). Returns `Insufficient` when total information is
 * below INFO_FLOOR_NATS. The sensitivity field flags a verdict that rests on a single
 * indicator (removing it flips the band).
 */
export function combineEvidence(items: EvidenceItem[], prior = 0.5): EvidenceResult {
  const base = posteriorFrom(prior, items);
  const band = bandFor(base.posterior, base.information);

  // Audit trail: running posterior after each item, applied in the given order using
  // the already-dependence-attenuated per-item deltas.
  const deltaById = new Map(base.perItem.map((p) => [p.id, p.delta]));
  let running = logit(prior);
  const updates: EvidenceUpdate[] = items.map((it) => {
    running += deltaById.get(it.id) ?? 0;
    return { id: it.id, deltaLogOdds: deltaById.get(it.id) ?? 0, posteriorAfter: sigmoid(running) };
  });

  // Sensitivity: which single item, removed, moves the posterior most / flips the band.
  let mostInfluential: string | null = null;
  let maxDelta = 0;
  let flips = false;
  for (const it of items) {
    const without = posteriorFrom(prior, items.filter((x) => x.id !== it.id));
    const d = Math.abs(without.posterior - base.posterior);
    if (d > maxDelta) {
      maxDelta = d;
      mostInfluential = it.id;
      flips = bandFor(without.posterior, without.information) !== band;
    }
  }

  return {
    prior,
    posterior: base.posterior,
    logOdds: base.logOdds,
    information: base.information,
    band,
    insufficient: band === "Insufficient",
    estimative: band === "Insufficient" ? undefined : estimativeLanguage(base.posterior),
    updates,
    sensitivity: { mostInfluential, delta: maxDelta, flipsBand: flips },
    method: "bayesian-log-odds",
    version: EVIDENCE_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Calibration harness (does a band mean what it claims?)
// ---------------------------------------------------------------------------

export interface ReliabilityBin {
  bin: number; // bin center (0..1)
  predicted: number; // mean predicted probability in the bin
  observed: number; // observed frequency of the positive label in the bin
  count: number;
}

/** Reliability curve: bin predictions by probability and compare predicted vs observed. */
export function reliabilityCurve(preds: { p: number; label: boolean }[], bins = 10): ReliabilityBin[] {
  const acc = Array.from({ length: bins }, () => ({ sumP: 0, pos: 0, count: 0 }));
  for (const { p, label } of preds) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    acc[idx].sumP += p;
    acc[idx].pos += label ? 1 : 0;
    acc[idx].count += 1;
  }
  const out: ReliabilityBin[] = [];
  for (let i = 0; i < bins; i++) {
    if (acc[i].count === 0) continue;
    out.push({ bin: (i + 0.5) / bins, predicted: acc[i].sumP / acc[i].count, observed: acc[i].pos / acc[i].count, count: acc[i].count });
  }
  return out;
}

/** Expected Calibration Error: count-weighted mean |predicted − observed| over bins. */
export function calibrationError(preds: { p: number; label: boolean }[], bins = 10): number {
  const curve = reliabilityCurve(preds, bins);
  const total = curve.reduce((s, b) => s + b.count, 0);
  if (total === 0) return NaN;
  return curve.reduce((s, b) => s + (b.count / total) * Math.abs(b.predicted - b.observed), 0);
}
