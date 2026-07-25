// Admiralty/NATO source grading (layer 03 · P1). Reliability (A–F) and
// credibility (1–6) are graded INDEPENDENTLY. F6 ("cannot be judged") is the
// default and the common, correct value; moving off it requires positive
// justification — inflating an unassessed source is the main abuse of this scale.

import type { InfoCredibility, SourceReliability } from "./types";

export const GRADING_VERSION = "case-grading-v1";

export interface Grade {
  reliability: SourceReliability;
  credibility: InfoCredibility;
  justification: string;
}

// The default. Adapters must justify anything better than this.
export const DEFAULT_GRADE: Grade = { reliability: "F", credibility: 6, justification: "F6 default — source not independently assessable" };

// Per-source-class grades, each with the reason the grade is defensible. Keyed
// by a stable source-class id the adapters pass. Anything absent falls back to
// DEFAULT_GRADE (F6), never a guessed middle value.
export const SOURCE_GRADES: Record<string, Grade> = {
  rdap:            { reliability: "A", credibility: 2, justification: "RDAP/WHOIS registry record — authoritative registrar data, occasionally stale" },
  ssl_ct:          { reliability: "A", credibility: 1, justification: "Certificate Transparency / issued cert — independently logged at issuance" },
  wayback:         { reliability: "B", credibility: 2, justification: "Internet Archive capture — third-party observation, timestamp is capture time" },
  server_log:      { reliability: "B", credibility: 2, justification: "operator's own server log — first-party observed request record" },
  received_header: { reliability: "C", credibility: 3, justification: "SMTP Received chain — relaying MTAs observed it, but upstream hops are asserted" },
  dns_live:        { reliability: "B", credibility: 3, justification: "live DNS/NS/MX resolution — current infrastructure fact, not historical" },
  ip_enrichment:   { reliability: "C", credibility: 3, justification: "IP geo/ASN enrichment — provider-dependent, approximate" },
  board_calibrated:{ reliability: "B", credibility: 2, justification: "Link Board calibrated artifact — reproducible under BOARD_RUBRIC_VERSION" },
  self_byline:     { reliability: "D", credibility: 4, justification: "self-reported byline/metadata — trivially forged, weak alone" },
  llm_claim:       { reliability: "F", credibility: 6, justification: "F6 — model-extracted claim, not a source of fact" },
};

export function gradeFor(sourceClass: string): Grade {
  return SOURCE_GRADES[sourceClass] ?? DEFAULT_GRADE;
}
