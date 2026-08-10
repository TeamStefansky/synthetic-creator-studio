// Evidence decay + regression alerts (layer 04 · P4). Sources die and, worse,
// silently change. Handle both as STATE TRANSITIONS, never deletion - the audit
// trail is the product's integrity.
//   404/410/DNS + archive  -> archived-only (strength unchanged; the fact was captured)
//   404/410/DNS, no archive -> lost
//   200 but contentHash differs (silent drift) -> original superseded (kept), a
//     new record created for the current bytes; a Structural alert names the
//     conclusions that relied on the old version.
// A conclusion resting SOLELY on lost evidence is downgraded and emits exactly one
// regression alert - an analyst who already acted needs the picture-got-weaker.

import type { Cluster } from "./cluster";
import type { EvidenceItem, EvidenceState } from "./types";

export const DECAY_VERSION = "case-decay-v1";
export const REVERIFY_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // slower than collection

export type ReverifyStatus = "ok" | "gone";
export interface Reverification {
  status: ReverifyStatus;
  currentContentHash?: string; // present when status ok
  archiveUrl?: string;         // an archived capture, if one exists
  at: string;
}

export interface DecayTransition {
  id: string;
  from: EvidenceState;
  to: EvidenceState;
  superseding?: EvidenceItem; // a new record for drifted content (both are kept)
  drift?: boolean;
}

/** archived-only and live preserve strength; lost and (unarchived) superseded do not. */
export function strengthPreserved(state: EvidenceState, hasArchive: boolean): boolean {
  if (state === "live" || state === "archived-only") return true;
  if (state === "superseded") return hasArchive;
  return false; // lost
}

/** Compute the state transition for one item under a re-verification. Pure. */
export function decayTransition(item: EvidenceItem, rv: Reverification): DecayTransition {
  const from = item.state;
  const originalHash = item.provenances[0]?.contentHash;

  if (rv.status === "ok") {
    if (rv.currentContentHash && originalHash && rv.currentContentHash !== originalHash) {
      // Silent drift: keep the original (superseded), create a new record for now.
      const superseding: EvidenceItem = {
        ...item,
        id: `${item.id}~${rv.currentContentHash.slice(0, 8)}`,
        state: "live",
        supersedes: item.id,
        provenances: [{
          ...item.provenances[0],
          contentHash: rv.currentContentHash,
          acquisitionMethod: "re-verification (content drift)",
          collectedAt: rv.at,
          archiveUrl: rv.archiveUrl ?? item.provenances[0]?.archiveUrl,
        }],
      };
      return { id: item.id, from, to: "superseded", superseding, drift: true };
    }
    return { id: item.id, from, to: from }; // unchanged
  }

  // gone
  return { id: item.id, from, to: rv.archiveUrl ? "archived-only" : "lost" };
}

/**
 * Clusters whose load-bearing (bridging) evidence is now entirely lost. Each is a
 * regression: downgrade + one alert. A cluster with at least one surviving
 * bridging edge is not a regression.
 */
export function regressionsFromLost(clusters: Cluster[], lostEvidenceIds: Set<string>): { clusterId: number; members: string[]; alert: string }[] {
  const out: { clusterId: number; members: string[]; alert: string }[] = [];
  for (const c of clusters) {
    if (c.members.length < 2 || c.bridgingEdges.length === 0) continue;
    const idful = c.bridgingEdges.filter((e) => e.evidenceId);
    if (idful.length === 0) continue;
    const allLost = idful.every((e) => lostEvidenceIds.has(e.evidenceId!));
    if (allLost) {
      out.push({
        clusterId: c.id,
        members: c.members,
        alert: `Regression: cluster ${c.members.join(", ")} rested solely on now-lost evidence - confidence downgraded from ${c.confidence}. Could also be: the source moved; the link may still hold but is no longer verifiable.`,
      });
    }
  }
  return out;
}

/** Structural alert copy for a silent-drift supersession. */
export function driftAlert(item: EvidenceItem, dependentConclusions: string[]): string {
  const who = dependentConclusions.length ? dependentConclusions.join(", ") : "no current conclusions";
  return `Silent content drift: ${item.kind} "${item.value}" changed while still returning 200. Original preserved (superseded); conclusions relying on the old version: ${who}.`;
}
