// Case diff (layer 03 · P7). Compares two case snapshots and emits a deduped set
// of change alerts. A partial-coverage run may ADD findings and must never RETRACT
// one (our incompleteness is not a change in the world), so removals are reported
// as "no longer observed" context, never as a regression alert.

import type { CaseFile } from "./synthesize";
import { STRENGTH_RANK } from "./cluster";

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
