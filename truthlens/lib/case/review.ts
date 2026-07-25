// Review state, candidate queue, and digest (layer 04 · P5). The primary diff
// renders against the LAST REVIEWED snapshot (not the previous run), consolidating
// every intervening run into one list. New entities go to a candidate queue and
// never enter the case until an analyst explicitly accepts them — automatic
// expansion is how a two-entity board becomes a dragnet. Nothing is auto-closed.

import type { MonitorDiffItem } from "./diff";
import type { ConfidenceLevel } from "@/components/ConfidenceBadge";

export const REVIEW_VERSION = "case-review-v1";
export const MAX_SNAPSHOTS_PER_CASE = 200; // retention cap (named); documented window

export interface ReviewState {
  caseId: string;
  scope: string;              // per user/workspace — never crosses scope
  lastReviewedAt?: string;
  lastReviewedShapeHash?: string;
}

export interface RunRecord {
  shapeHash: string;
  at: string;
  items: MonitorDiffItem[];
}

/**
 * Consolidate all runs since the last reviewed shape into one list, de-duplicated
 * by (kind, subjectKey) keeping the most recent. Runs at or before the reviewed
 * shape are excluded.
 */
export function consolidateSinceReview(runs: RunRecord[], lastReviewedShapeHash?: string): MonitorDiffItem[] {
  let started = !lastReviewedShapeHash;
  const merged = new Map<string, MonitorDiffItem>();
  for (const run of runs) {
    if (!started) { if (run.shapeHash === lastReviewedShapeHash) started = true; continue; }
    for (const it of run.items) merged.set(it.subjectKey, it); // newest state per subject
  }
  return [...merged.values()];
}

// ---- Candidate queue: discovered entities, never auto-added --------------------

export interface Candidate {
  entity: string;
  linkedTo: string;
  strength: ConfidenceLevel;
  evidence: string;
  discoveredAt: string;
  accepted?: boolean;
}

/** A discovered entity ALWAYS lands here; it does not touch the case. */
export function queueCandidate(queue: Candidate[], c: Candidate): Candidate[] {
  if (queue.some((q) => q.entity === c.entity)) return queue;
  return [...queue, { ...c, accepted: false }];
}

/** The entities actually in the case = the original set plus ONLY accepted candidates. */
export function caseEntities(original: string[], queue: Candidate[]): string[] {
  return [...original, ...queue.filter((c) => c.accepted).map((c) => c.entity)];
}

/** Explicit acceptance — the only path a candidate enters the case. */
export function acceptCandidate(queue: Candidate[], entity: string): Candidate[] {
  return queue.map((c) => (c.entity === entity ? { ...c, accepted: true } : c));
}

// ---- Digest: everything below the alerting bar, never invisible ---------------

export interface Digest {
  evidential: MonitorDiffItem[];
  candidates: Candidate[];
  suppressedUnstable: string[];
  partialRuns: number;
}

export function buildDigest(items: MonitorDiffItem[], candidates: Candidate[], suppressedUnstable: string[], partialRuns: number): Digest {
  return {
    evidential: items.filter((i) => !i.alerts), // below the alerting bar
    candidates: candidates.filter((c) => !c.accepted),
    suppressedUnstable,
    partialRuns,
  };
}
