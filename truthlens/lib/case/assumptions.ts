// Key Assumptions Check (layer 03 · P5). Every assumption the case rests on, each
// with its own confidence and a load-bearing flag. A load-bearing, low-confidence
// assumption is the single most important finding in the case - most analytic
// surprises are not new evidence, they are an old assumption failing - so it
// surfaces in the summary, not an appendix.

export const ASSUMPTIONS_VERSION = "case-assumptions-v1";

export type AssumptionConfidence = "low" | "moderate" | "high";

export interface Assumption {
  id: string;
  text: string;
  confidence: AssumptionConfidence;
  loadBearing: boolean;
}

export interface AssumptionsResult {
  version: string;
  list: Assumption[];
  critical: Assumption[];   // load-bearing AND low-confidence
  summaryLines: string[];   // to render at the top of the wall, not an appendix
}

export function analyzeAssumptions(list: Assumption[]): AssumptionsResult {
  const critical = list.filter((a) => a.loadBearing && a.confidence === "low");
  const summaryLines = critical.map(
    (a) => `Load-bearing low-confidence assumption: "${a.text}" - if it fails, the case may not hold.`,
  );
  return { version: ASSUMPTIONS_VERSION, list, critical, summaryLines };
}

/** A conclusion that nothing could disprove is a belief. Falsification must be non-empty. */
export function assertNonEmptyFalsification(falsification: string[]): boolean {
  return Array.isArray(falsification) && falsification.filter((s) => s && s.trim()).length > 0;
}
