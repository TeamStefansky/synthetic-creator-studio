// Case diff (layer 03 · P7). Compares two case snapshots and emits a deduped set
// of change alerts. A partial-coverage run may ADD findings and must never RETRACT
// one (our incompleteness is not a change in the world), so removals are reported
// as "no longer observed" context, never as a regression alert.

import type { CaseFile } from "./synthesize";
import { STRENGTH_RANK, type Cluster } from "./cluster";
import { caseShapeHash, type Coverage } from "./shape";
import { classifyMateriality, tierAlerts, type ChangeKind, type MaterialityTier } from "./materiality";

export interface CaseDiff {
  addedEvidenceIds: string[];
  droppedEvidenceIds: string[];   // context only, never an alert
  newClusters: number[];          // cluster ids present now, absent before (by member set)
  strengthenedClusters: number[];
  alerts: string[];               // deduped, human-readable
}

const memberKey = (members: string[]) => members.slice().sort().join("|");

export function diffCases(prev: CaseFile | null, next: CaseFile): CaseDiff {
  const prevIds = new Set(prev?.ledger.items.map((i) => i.id) || []);
  const nextIds = new Set(next.ledger.items.map((i) => i.id));
  const addedEvidenceIds = [...nextIds].filter((id) => !prevIds.has(id)).sort();
  const droppedEvidenceIds = [...prevIds].filter((id) => !nextIds.has(id)).sort();

  const prevClusters = new Map((prev?.clusters || []).filter((c) => c.members.length > 1).map((c) => [memberKey(c.members), c]));
  const newClusters: number[] = [];
  const strengthenedClusters: number[] = [];
  const alerts: string[] = [];

  for (const c of next.clusters) {
    if (c.members.length < 2) continue;
    const before = prevClusters.get(memberKey(c.members));
    if (!before) { newClusters.push(c.id); alerts.push(`New cluster: ${c.members.join(", ")} (${c.confidence}).`); }
    else if (STRENGTH_RANK[c.confidence] > STRENGTH_RANK[before.confidence]) {
      strengthenedClusters.push(c.id);
      alerts.push(`Cluster ${c.members.join(", ")} strengthened ${before.confidence} -> ${c.confidence}.`);
    }
  }

  // Dedupe alerts (a partial re-run can re-observe the same change).
  const deduped = [...new Set(alerts)];
  return { addedEvidenceIds, droppedEvidenceIds, newClusters, strengthenedClusters, alerts: deduped };
}

// ---------------------------------------------------------------------------
// Monitoring diff (layer 04 · P1). Shape hash is the first gate: identical shape
// => zero items, zero alerts, no matter how much the ledger churned. Otherwise
// every change is classified by materiality, and - the hard guard - a
// partial-coverage run may ADD but never RETRACT (removals are suppressed and
// counted, never alerted). Only Structural + Interpretive changes alert.
// ---------------------------------------------------------------------------

export interface MonitorDiffItem {
  kind: ChangeKind;
  tier: MaterialityTier;
  subjectKey: string;
  from?: string;
  to?: string;
  isRemoval: boolean;
  alerts: boolean;
  // v2: previous vs new judgment + the evidence that moved it (populated on judgment changes).
  judgmentDelta?: { field: string; from: string; to: string };
}

export interface MonitorResult {
  shapeChanged: boolean;
  prevShapeHash: string | null;
  nextShapeHash: string;
  coverage: Coverage;
  items: MonitorDiffItem[];
  alerts: string[];
  suppressedRemovals: number;   // retractions withheld because coverage was partial
}

const memberSet = (cf: CaseFile): Map<string, Cluster> => new Map(cf.clusters.filter((c) => c.members.length > 1).map((c) => [memberKey(c.members), c]));
const directedSet = (cf: CaseFile) => new Set(cf.path.edges.filter((e) => e.kind === "directed").map((e) => `${e.from}->${e.to}`));

export function monitorDiff(prev: CaseFile | null, next: CaseFile, coverage: Coverage = "full"): MonitorResult {
  const prevShapeHash = prev ? caseShapeHash(prev, "full") : null;
  const nextShapeHash = caseShapeHash(next, coverage);
  const partial = coverage === "partial";

  // Gate 1: identical shape => nothing to report, unconditionally.
  if (prevShapeHash !== null && prevShapeHash === nextShapeHash) {
    return { shapeChanged: false, prevShapeHash, nextShapeHash, coverage, items: [], alerts: [], suppressedRemovals: 0 };
  }

  const items: MonitorDiffItem[] = [];
  let suppressedRemovals = 0;
  const add = (kind: ChangeKind, subjectKey: string, isRemoval: boolean, extra?: Partial<MonitorDiffItem>) => {
    // Retraction guard: a partial-coverage run never retracts and never alerts a removal.
    if (isRemoval && partial) { suppressedRemovals++; return; }
    const tier = classifyMateriality(kind);
    items.push({ kind, tier, subjectKey, isRemoval, alerts: tierAlerts(tier), ...extra });
  };

  const prevClusters: Map<string, Cluster> = prev ? memberSet(prev) : new Map();
  const nextClusters = memberSet(next);
  for (const [key, c] of nextClusters) {
    const before = prevClusters.get(key);
    if (!before) add("cluster_merge", key, false, { to: c.confidence });
    else if (before.confidence !== c.confidence) {
      const weaker = STRENGTH_RANK[c.confidence] < STRENGTH_RANK[before.confidence];
      add("confidence_band_change", key, weaker, { from: before.confidence, to: c.confidence, judgmentDelta: { field: "cluster_confidence", from: before.confidence, to: c.confidence } });
    }
  }
  for (const [key] of prevClusters) if (!nextClusters.has(key)) add("cluster_split", key, true);

  // Path directions.
  const prevDir = prev ? directedSet(prev) : new Set<string>();
  const nextDir = directedSet(next);
  for (const d of nextDir) if (!prevDir.has(d)) add("direction_established", d, false);
  for (const d of prevDir) if (!nextDir.has(d)) add("direction_lost", d, true);

  // Rung + verdict (judgment-level).
  if (prev && prev.bottomLine.rung !== next.bottomLine.rung) {
    const downgrade = prev.bottomLine.rung === "common-operation" && next.bottomLine.rung === "association";
    add(downgrade ? "rung_downgrade" : "hypothesis_flip", "case:rung", downgrade, { from: prev.bottomLine.rung, to: next.bottomLine.rung, judgmentDelta: { field: "rung", from: prev.bottomLine.rung, to: next.bottomLine.rung } });
  }
  if (prev && prev.ach.undetermined !== next.ach.undetermined) {
    add("verdict_change", "case:verdict", false, { from: String(prev.ach.undetermined), to: String(next.ach.undetermined) });
  }

  const alerts = items.filter((i) => i.alerts).map((i) => `[${i.tier}] ${i.kind}: ${i.subjectKey}${i.from || i.to ? ` (${i.from ?? "∅"} → ${i.to ?? "∅"})` : ""}`);
  return { shapeChanged: true, prevShapeHash, nextShapeHash, coverage, items, alerts: [...new Set(alerts)], suppressedRemovals };
}
