// Evidence ledger (layer 03 · P1). Server-side. Builds the normalized,
// integrity-hashed, source-graded, time-tiered evidence set from adapter drafts.
//
// Invariants enforced here: id excludes sourceUrl (one fact from two sources =>
// one row, two provenances); evidence is append-only (corrections supersede, never
// delete); corroboration weight counts INDEPENDENT lineages, so six outlets
// carrying one wire story score as one.

import { createHash } from "node:crypto";
import { clusterNearDuplicates } from "@/lib/similarity";
import type { EvidenceDraft, EvidenceItem, EventTime, Ledger, TimeTier } from "./types";

export const LEDGER_VERSION = "case-ledger-v1";

/** SHA-256 hex of the retrieved bytes - the chain-of-custody integrity anchor. */
export function contentHashOf(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}
export function verifyContentHash(bytes: string, hash: string): boolean {
  return contentHashOf(bytes) === hash;
}

export function normalizeValue(v: string): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Deterministic id - hash(kind, entityKey, normalizedValue). Excludes sourceUrl. */
export function evidenceId(kind: string, entityKey: string, normalizedValue: string): string {
  return createHash("sha256").update(`${kind}␟${entityKey}␟${normalizedValue}`, "utf8").digest("hex").slice(0, 24);
}

const TIER_RANK: Record<TimeTier, number> = { T1: 4, T2: 3, T3: 2, T4: 1 };
/** Keep the better-tier time; on a tie keep the earlier instant. */
function betterTime(a?: EventTime, b?: EventTime): EventTime | undefined {
  if (!a) return b;
  if (!b) return a;
  if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] > TIER_RANK[b.tier] ? a : b;
  return Date.parse(a.at) <= Date.parse(b.at) ? a : b;
}

const provKey = (p: EvidenceDraft["provenance"]) => `${p.lineageId}␟${p.contentHash}␟${p.sourceUrl || ""}`;

/**
 * Build the ledger from drafts. Drafts sharing a deterministic id collapse into
 * one EvidenceItem carrying each distinct provenance. Deterministic: identical
 * drafts + identical `enteredCaseAt` produce identical output.
 */
export function buildLedger(drafts: EvidenceDraft[], enteredCaseAt = new Date().toISOString()): Ledger {
  const byId: Record<string, EvidenceItem> = {};
  for (const d of drafts) {
    const nv = d.normalizedValue ?? normalizeValue(d.value);
    const id = evidenceId(d.kind, d.entityKey, nv);
    const existing = byId[id];
    if (!existing) {
      byId[id] = {
        id, entityKey: d.entityKey, kind: d.kind, value: d.value, normalizedValue: nv,
        eventTime: d.eventTime, enteredCaseAt, state: "live",
        provenances: [d.provenance], notes: d.notes,
      };
    } else {
      existing.eventTime = betterTime(existing.eventTime, d.eventTime);
      if (!existing.provenances.some((p) => provKey(p) === provKey(d.provenance))) existing.provenances.push(d.provenance);
      if (d.notes && !existing.notes?.includes(d.notes)) existing.notes = [existing.notes, d.notes].filter(Boolean).join("; ");
    }
  }
  const items = Object.values(byId).sort((a, b) => a.id.localeCompare(b.id));
  return { items, byId };
}

/**
 * Corroboration weight = number of INDEPENDENT lineages behind the item. Two
 * provenances that share a lineageId (syndicated/mirrored) count once.
 */
export function corroborationWeight(item: EvidenceItem): number {
  return new Set(item.provenances.map((p) => p.lineageId)).size;
}

/**
 * Append-only correction: mark the old record superseded and return a new record
 * that supersedes it. The old record is never removed.
 */
export function supersede(ledger: Ledger, oldId: string, replacement: EvidenceItem): Ledger {
  const old = ledger.byId[oldId];
  if (old) old.state = "superseded";
  const next: EvidenceItem = { ...replacement, supersedes: oldId };
  const byId = { ...ledger.byId, [next.id]: next, ...(old ? { [oldId]: old } : {}) };
  return { items: Object.values(byId).sort((a, b) => a.id.localeCompare(b.id)), byId };
}

/**
 * Assign lineage ids so syndicated/mirrored copies of the same content collapse
 * to one corroboration weight. Returns one lineageId per input text; near-
 * duplicates (per lib/similarity) share an id.
 */
export function assignLineageIds(texts: string[], prefix = "lin"): string[] {
  const tagged = texts.map((t, i) => ({ t, i }));
  const clusters = clusterNearDuplicates(tagged, (x) => x.t);
  const out: string[] = new Array(texts.length);
  clusters.forEach((cluster, ci) => {
    for (const member of cluster) out[member.i] = `${prefix}:${ci}`;
  });
  // Any item not placed (defensive) gets its own lineage.
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = `${prefix}:solo:${i}`;
  return out;
}
