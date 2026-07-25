// Examination discipline (layer 06 · P4). Three controls from forensic practice:
//  1. Sufficiency BEFORE comparison — assess an artifact on its own merits against
//     a fixed threshold and record the decision before any comparison runs.
//  2. Context firewall (Linear Sequential Unmasking) — the comparator receives
//     task-relevant information ONLY. It is architecturally unable to see the
//     hypothesis ranking, the leading explanation, or any prior conclusion, so
//     contextual bias (a property of expert cognition, not weak examiners) cannot
//     enter. Enforced by a deliberately narrow input TYPE, not by instruction.
//  3. Blind verification — a second, independent pass that does not see the first;
//     disagreement yields `inconclusive`, never an average, never the stronger.

export const EXAMINE_VERSION = "examine-v1";
export const INCONCLUSIVE_FLOOR = 0.1; // if the comparator's inconclusive rate is below this, flag it

export type SufficiencyDecision = "sufficient" | "insufficient";
export const DEFAULT_SUFFICIENCY = 0.5;
// Per-artifact minimum quality to be worth comparing at all.
export const SUFFICIENCY_THRESHOLDS: Record<string, number> = {
  ssl_san: 0.6,        // a wildcard/CDN cert is low quality for individuation
  boilerplate: 0.7,    // short/common boilerplate is insufficient
  ga_id: 0.4,
};

export interface SufficiencyRecord {
  kind: string;
  quality: number;
  decision: SufficiencyDecision;
  recordedBefore: true; // recorded before any comparison — a structural guarantee
}

export function assessSufficiency(kind: string, quality: number): SufficiencyRecord {
  const threshold = SUFFICIENCY_THRESHOLDS[kind] ?? DEFAULT_SUFFICIENCY;
  return { kind, quality, decision: quality >= threshold ? "sufficient" : "insufficient", recordedBefore: true };
}

// The ONLY thing the comparator may see. No hypothesis, no theory, no ranking,
// no prior conclusion — those fields are not on this type, so they are unreachable.
export interface ComparisonInput {
  kind: string;
  valueA: string;
  valueB: string;
  sufficientA: boolean;
  sufficientB: boolean;
}

export type ComparisonOutcome = "identification" | "exclusion" | "inconclusive";

/** Pure comparison. Deterministic in its input alone — case theory cannot reach it. */
export function compare(input: ComparisonInput): ComparisonOutcome {
  if (!input.sufficientA || !input.sufficientB) return "inconclusive"; // frequent + expected
  return input.valueA.trim().toLowerCase() === input.valueB.trim().toLowerCase() ? "identification" : "exclusion";
}

/**
 * Blind verification: two independent examinations of the same feature. The
 * verifier does not see the first conclusion. Agreement stands; disagreement is
 * inconclusive — never averaged, never the stronger reading (that would measure
 * agreeableness, not evidence).
 */
export function blindVerify(first: ComparisonOutcome, second: ComparisonOutcome): ComparisonOutcome {
  return first === second ? first : "inconclusive";
}

export function inconclusiveRate(outcomes: ComparisonOutcome[]): number {
  if (!outcomes.length) return 0;
  return outcomes.filter((o) => o === "inconclusive").length / outcomes.length;
}

export function inconclusiveRateBelowFloor(outcomes: ComparisonOutcome[]): boolean {
  return outcomes.length > 0 && inconclusiveRate(outcomes) < INCONCLUSIVE_FLOOR;
}
