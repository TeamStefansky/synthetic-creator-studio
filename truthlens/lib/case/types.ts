// Case Synthesis v2 — the evidence ledger's type system (layer 03 · P1).
// Server-side only. Everything that determines a score/direction/grade is a typed,
// reproducible value here, never model output. Consumes lib/board/* + lib/types.
//
// The T4 asymmetry is encoded in the type system (a bound of "upper" cannot be a
// lower bound for ordering), not left to a comment — see calibrate-time.ts.

export type EvidenceKind =
  | "domain" | "ip" | "origin_ip" | "asn" | "net_org" | "ga_id" | "adsense_id"
  | "ssl_san" | "registrar" | "ns" | "mx" | "archive_first_seen" | "domain_created"
  | "claim" | "email_origin" | "auth_result" | "board_edge";

// Time reliability tiers (evidence-handling.md §4). Ordering may only use a
// tier's value as a *lower bound* when `bound` is "point" or "lower" AND the tier
// is T2 or better — enforced by usableLowerBound() in calibrate-time.ts.
export type TimeTier = "T1" | "T2" | "T3" | "T4";
export type TimeBound = "point" | "lower" | "upper"; // T4 is always "upper"

export interface EventTime {
  at: string;               // ISO 8601, normalized to UTC
  offset?: string | null;   // original UTC offset, preserved (behavioral evidence)
  tier: TimeTier;
  bound: TimeBound;
}

// Admiralty/NATO grading — reliability × credibility, graded independently.
export type SourceReliability = "A" | "B" | "C" | "D" | "E" | "F";
export type InfoCredibility = 1 | 2 | 3 | 4 | 5 | 6;

// Append-only lifecycle. Records transition state; they are never deleted.
export type EvidenceState = "live" | "archived-only" | "lost" | "superseded";

// One retrieval of a fact from one source. A fact found by two sources becomes
// one EvidenceItem carrying two provenances (a corroboration signal) — unless
// they share a lineage, in which case they collapse to one corroboration weight.
export interface Provenance {
  sourceUrl?: string;
  archiveUrl?: string;
  contentHash: string;        // hash of retrieved bytes, not the URL
  acquisitionMethod: string;  // transport, auth state, headers summary
  collector: string;
  collectorVersion: string;
  collectedAt: string;        // ISO
  lineageId: string;          // same-origin collapse key (syndication/mirrors)
  sourceGrade: SourceReliability;
  infoCredibility: InfoCredibility;
  gradeJustification: string; // required; "F6 default (unassessed)" is valid
}

export interface EvidenceItem {
  id: string;                 // hash(kind, entityKey, normalizedValue) — excludes sourceUrl
  entityKey: string;          // the subject entity, e.g. "domain:techforpalestine.org"
  kind: EvidenceKind;
  value: string;
  normalizedValue: string;
  eventTime?: EventTime;
  enteredCaseAt: string;      // when this fact entered the case (post-hypothesis-bias signal)
  state: EvidenceState;
  provenances: Provenance[];  // >= 1
  supersedes?: string;        // id of the record this correction replaces
  notes?: string;
}

// What an adapter emits: one draft per (fact, source). The ledger assigns the
// deterministic id and merges drafts sharing an id into one EvidenceItem.
export interface EvidenceDraft {
  entityKey: string;
  kind: EvidenceKind;
  value: string;
  normalizedValue?: string;   // defaults to normalizeValue(value)
  eventTime?: EventTime;
  provenance: Provenance;
  notes?: string;
}

export interface Ledger {
  items: EvidenceItem[];
  byId: Record<string, EvidenceItem>;
}
