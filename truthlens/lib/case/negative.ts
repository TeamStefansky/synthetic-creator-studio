// Negative evidence vs. gaps (layer 03 · P4). The distinction this whole section
// exists to protect: an absence is EVIDENCE against a hypothesis only when all
// four conditions hold; otherwise it is a GAP and scores zero in both directions.
// Conflating them manufactures certainty out of incomplete collection. They are
// two distinct types and are never interchangeable in the scorer.

import type { EvidenceKind, HypothesisKind } from "./types";

export const NEGATIVE_EVIDENCE_SCORE = -1; // contribution against the hypothesis that predicted the artifact
export const GAP_SCORE = 0;                 // a gap NEVER moves a hypothesis

export interface SearchAttempt {
  id: string;
  hypothesis: HypothesisKind;   // the hypothesis that predicted this artifact
  expectedKind: EvidenceKind;
  predicted: true;              // condition 1 — always true here (only predicted artifacts are searched)
  searchCapable: boolean;      // condition 2 — right source/period/access, NOT truncated
  coverageComplete: boolean;   // condition 3 — source reachable and complete for the window
  found: boolean;              // condition 4 — the result
  where: string;               // provenance of the attempt
}

export type EvidenceOutcome =
  | { type: "found"; hypothesis: HypothesisKind; expectedKind: EvidenceKind }
  | { type: "negative_evidence"; hypothesis: HypothesisKind; expectedKind: EvidenceKind; where: string }
  | { type: "gap"; hypothesis: HypothesisKind; expectedKind: EvidenceKind; reason: string; where: string };

/** Apply the four-condition test. Pure. */
export function classifyOutcome(a: SearchAttempt): EvidenceOutcome {
  if (a.found) return { type: "found", hypothesis: a.hypothesis, expectedKind: a.expectedKind };
  if (a.predicted && a.searchCapable && a.coverageComplete) {
    return { type: "negative_evidence", hypothesis: a.hypothesis, expectedKind: a.expectedKind, where: a.where };
  }
  const reason = !a.searchCapable
    ? "search not capable (wrong source/period/access or truncated) — absence carries no weight"
    : "source not reachable/complete for the window — absence carries no weight";
  return { type: "gap", hypothesis: a.hypothesis, expectedKind: a.expectedKind, reason, where: a.where };
}

/**
 * ACH contribution of an outcome to a given hypothesis. Only negative evidence
 * against THIS hypothesis moves it; a gap contributes exactly zero, always.
 * `found` is scored by the ACH consistency pass (P5), not here.
 */
export function scoreContribution(o: EvidenceOutcome, hypothesis: HypothesisKind): number {
  if (o.type === "negative_evidence" && o.hypothesis === hypothesis) return NEGATIVE_EVIDENCE_SCORE;
  if (o.type === "gap") return GAP_SCORE;
  return 0;
}
