// Shared adapter helpers (layer 03 · P1). Adapters are pure: tool output ->
// EvidenceDraft[]. They never invent an unsourced field; a missing grade is F6.

import { contentHashOf } from "../ledger";
import { gradeFor } from "../grading";
import type { EvidenceDraft, EventTime, Provenance, TimeTier } from "../types";

export interface ProvenanceInput {
  sourceClass: string;      // key into SOURCE_GRADES (F6 if absent)
  sourceUrl?: string;
  archiveUrl?: string;
  bytes?: string;           // content sample to hash; falls back to a stable string
  acquisitionMethod?: string;
  collector?: string;
  collectorVersion?: string;
  collectedAt: string;      // from the tool's own fetch time - keep deterministic
  lineageId?: string;
}

export function mkProvenance(p: ProvenanceInput): Provenance {
  const g = gradeFor(p.sourceClass);
  return {
    sourceUrl: p.sourceUrl,
    archiveUrl: p.archiveUrl,
    contentHash: contentHashOf(p.bytes ?? `${p.sourceClass}␟${p.sourceUrl ?? ""}`),
    acquisitionMethod: p.acquisitionMethod ?? `${p.sourceClass} retrieval`,
    collector: p.collector ?? p.sourceClass,
    collectorVersion: p.collectorVersion ?? "1",
    collectedAt: p.collectedAt,
    lineageId: p.lineageId ?? `${p.sourceClass}:${p.sourceUrl ?? p.collector ?? "x"}`,
    sourceGrade: g.reliability,
    infoCredibility: g.credibility,
    gradeJustification: g.justification,
  };
}

export function eventTime(at: string | undefined, tier: TimeTier, offset?: string | null): EventTime | undefined {
  if (!at) return undefined;
  const d = new Date(at);
  if (isNaN(d.getTime())) return undefined;
  return { at: d.toISOString(), offset: offset ?? null, tier, bound: tier === "T4" ? "upper" : "point" };
}

export const draft = (d: EvidenceDraft): EvidenceDraft => d;
