// Predicted artifacts (layer 03 · P4). A declarative table: hypothesis kind ->
// the artifact kinds it predicts should exist -> where they would be collected.
// Locard applied: derive in advance what each hypothesis requires, then go look.
// Pure data; the collection results are classified in negative.ts.

import type { EvidenceKind, HypothesisKind } from "./types";

export const PREDICTIONS_VERSION = "case-predictions-v1";

export interface Prediction {
  hypothesis: HypothesisKind;
  expects: EvidenceKind;
  collectedFrom: string;   // the source/where the artifact would be found
  rationale: string;
}

// Only the substantive hypotheses predict positive artifacts. The null predicts
// the ABSENCE of individualizing overlap (its predictions are the substantive
// one's, scored inverted in the matrix), and deception is scored via MOM-POP in
// deception.ts, not by artifact prediction.
export const PREDICTIONS: Prediction[] = [
  { hypothesis: "same_operator", expects: "ga_id", collectedFrom: "page HTML (analytics/tag)", rationale: "one operator commonly reuses a self-hosted analytics/tag id" },
  { hypothesis: "same_operator", expects: "ssl_san", collectedFrom: "certificate transparency / served cert", rationale: "one operator provisions both hosts on one non-wildcard certificate" },
  { hypothesis: "same_operator", expects: "origin_ip", collectedFrom: "public DNS / subdomain probing", rationale: "shared true origin behind a CDN points to common control" },
  { hypothesis: "same_operator", expects: "net_org", collectedFrom: "ASN/nameserver enrichment", rationale: "a niche shared host is weakly suggestive of common control" },
];

export function predictionsFor(hypothesis: HypothesisKind): Prediction[] {
  return PREDICTIONS.filter((p) => p.hypothesis === hypothesis);
}
