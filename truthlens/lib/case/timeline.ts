// Timeline + first-observed (layer 03 · P2). Merges the ledger into one
// chronological sequence with adaptive bucketing (minutes inside a burst, days
// for infrastructure events), every entry keeping its tier badge. Computes the
// earliest observed appearance per entity and per CLAIM (claim identity via
// lib/case/claim-identity, not string equality). Never says "origin" - only
// "earliest observed in collected data".

import { usableLowerBound } from "./calibrate-time";
import { clusterClaims } from "./claim-identity";
import { EARLIEST_OBSERVED_LABEL } from "./vocab";
import type { EvidenceItem, Ledger, TimeTier } from "./types";

export const TIMELINE_VERSION = "case-timeline-v1";
export const BURST_WINDOW_MS = 60 * 60 * 1000; // 1h
export const BURST_MIN_EVENTS = 3;             // >=3 dated events for one entity in the window => minute buckets

export interface TimelineEntry {
  itemId: string;
  entityKey: string;
  kind: string;
  value: string;
  at: string;
  offset?: string | null;
  tier: TimeTier;
  ordered: boolean;   // whether this time can anchor an ordering (T2+, not upper-bound)
  bucket: string;     // adaptive bucket key
}

export interface EarliestObserved {
  key: string;
  label: string;      // always the collection-scoped phrasing
  itemId: string;
  at: string;
  tier: TimeTier;
}

export interface ClaimTimeline {
  representative: string;
  memberIds: string[];
  earliestAt?: string;
  earliestTier?: TimeTier;
  label: string;
}

export interface Timeline {
  version: string;
  entries: TimelineEntry[];
  earliestByEntity: EarliestObserved[];
  earliestByClaim: ClaimTimeline[];
  note: string;
}

function bucketKey(at: string, granularity: "minute" | "day"): string {
  const iso = new Date(at).toISOString();
  return granularity === "minute" ? iso.slice(0, 16) + "Z" : iso.slice(0, 10);
}

export function buildTimeline(ledger: Ledger): Timeline {
  const dated = ledger.items.filter((i) => i.eventTime && !Number.isNaN(Date.parse(i.eventTime.at)) && i.state !== "superseded");

  // Per-entity burst detection -> granularity.
  const byEntity = new Map<string, EvidenceItem[]>();
  for (const i of dated) { const a = byEntity.get(i.entityKey) || []; a.push(i); byEntity.set(i.entityKey, a); }
  const granularityFor = new Map<string, "minute" | "day">();
  for (const [ek, items] of byEntity) {
    const ts = items.map((i) => Date.parse(i.eventTime!.at)).sort((a, b) => a - b);
    let burst = false;
    for (let i = 0; i + BURST_MIN_EVENTS - 1 < ts.length; i++) {
      if (ts[i + BURST_MIN_EVENTS - 1] - ts[i] <= BURST_WINDOW_MS) { burst = true; break; }
    }
    granularityFor.set(ek, burst ? "minute" : "day");
  }

  const entries: TimelineEntry[] = dated.map((i) => ({
    itemId: i.id, entityKey: i.entityKey, kind: i.kind, value: i.value,
    at: new Date(i.eventTime!.at).toISOString(), offset: i.eventTime!.offset ?? null,
    tier: i.eventTime!.tier, ordered: usableLowerBound(i.eventTime) !== null,
    bucket: bucketKey(i.eventTime!.at, granularityFor.get(i.entityKey) || "day"),
  })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.itemId.localeCompare(b.itemId));

  // Earliest observed per entity (prefer an orderable time, else earliest at all).
  const earliestByEntity: EarliestObserved[] = [];
  for (const [ek, items] of byEntity) {
    const sorted = [...items].sort((a, b) => Date.parse(a.eventTime!.at) - Date.parse(b.eventTime!.at));
    const orderable = sorted.find((i) => usableLowerBound(i.eventTime) !== null) || sorted[0];
    earliestByEntity.push({
      key: ek, label: `${EARLIEST_OBSERVED_LABEL} for ${ek}`,
      itemId: orderable.id, at: new Date(orderable.eventTime!.at).toISOString(), tier: orderable.eventTime!.tier,
    });
  }
  earliestByEntity.sort((a, b) => a.key.localeCompare(b.key));

  // Earliest observed per claim (claim identity via clustering).
  const claimItems = ledger.items.filter((i) => i.kind === "claim" && i.state !== "superseded");
  const clusters = clusterClaims(claimItems, (i) => i.value);
  const earliestByClaim: ClaimTimeline[] = clusters.map((c) => {
    const timed = c.members.filter((m) => m.eventTime && !Number.isNaN(Date.parse(m.eventTime.at)))
      .sort((a, b) => Date.parse(a.eventTime!.at) - Date.parse(b.eventTime!.at));
    const first = timed[0];
    return {
      representative: c.representative.value,
      memberIds: c.members.map((m) => m.id),
      earliestAt: first ? new Date(first.eventTime!.at).toISOString() : undefined,
      earliestTier: first?.eventTime?.tier,
      label: EARLIEST_OBSERVED_LABEL,
    };
  });

  return {
    version: TIMELINE_VERSION,
    entries,
    earliestByEntity,
    earliestByClaim,
    note: `${entries.length} dated events; tiers preserved per entry. Earliest points are ${EARLIEST_OBSERVED_LABEL} - a statement about our collection, not about where a thing began.`,
  };
}
