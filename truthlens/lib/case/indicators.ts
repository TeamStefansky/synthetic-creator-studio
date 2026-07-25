// Indicators & Warning, declared in advance (layer 04 · P5 / spec B2). Classifying
// changes AFTER they occur is necessary but not sufficient — an indicator defined
// after the fact is pattern-matching on noise. Every case carries indicators
// declared BEFORE collection, derived from the hypothesis set and predicted
// artifacts. A fired indicator alerts at Structural tier and names its hypothesis
// + direction. A non-firing indicator becomes negative evidence under full
// coverage, a gap under partial — never scored under degraded coverage.

import type { EvidenceKind, HypothesisKind } from "./types";

export const INDICATORS_VERSION = "case-indicators-v1";
// An indicator that would fire on routine activity is worse than none — it trains
// the analyst to ignore the channel. Reject high-false-positive indicators.
export const MAX_INDICATOR_FPR = 0.3;

export interface Indicator {
  id: string;
  hypothesisId: HypothesisKind;
  description: string;
  observableArtifact: EvidenceKind;
  collectionPath: string;
  direction: "supports" | "undercuts";
  expectedFalsePositiveRate: number; // 0..1
  declaredAt: string;
}

export function declareIndicator(ind: Indicator): { ok: boolean; reason?: string } {
  if (ind.expectedFalsePositiveRate > MAX_INDICATOR_FPR) {
    return { ok: false, reason: `false-positive rate ${ind.expectedFalsePositiveRate} exceeds ${MAX_INDICATOR_FPR}; would train the analyst to ignore the channel` };
  }
  if (!ind.hypothesisId || !ind.observableArtifact) return { ok: false, reason: "an indicator must bind to a hypothesis and a concrete observable artifact" };
  return { ok: true };
}

/** A fired indicator alerts Structural regardless of the generic classifier. */
export function firedAlert(ind: Indicator): string {
  const verb = ind.direction === "supports" ? "supports" : "undercuts";
  return `[structural] indicator fired: ${ind.description} — ${verb} hypothesis "${ind.hypothesisId}".`;
}

export type NonFiringOutcome = "negative_evidence" | "gap" | "pending";

/**
 * What a NON-firing indicator becomes at the end of its window. Under full
 * coverage an adequate absence is negative evidence against its hypothesis; under
 * partial coverage it is a gap (scores zero); before the window elapses it is
 * pending. Never scores under degraded coverage.
 */
export function nonFiringOutcome(opts: { windowElapsed: boolean; coverage: "full" | "partial" }): NonFiringOutcome {
  if (!opts.windowElapsed) return "pending";
  return opts.coverage === "full" ? "negative_evidence" : "gap";
}
