// Pure aggregation for the geopolitics layer: de-duplicate, split events vs
// forecasts, and break down by region / kind. Testable; no network, no fakery -
// unconnected sources are passed through as-is so the UI shows them honestly.

import type { GeoRecord, GeoResult, GeoKind } from "./geopolitics";
import { REGIONS } from "./geopolitics";
import type { SourceStatus } from "./narrative/types";

export interface RegionCount {
  key: string;
  label: string;
  count: number;
}
export interface KindCount {
  kind: GeoKind;
  count: number;
}

export interface GeopoliticsAggregate {
  total: number;
  sources: SourceStatus[];
  byRegion: RegionCount[];
  byKind: KindCount[];
  /** Situational events (conflict / humanitarian / disaster), most-recent first. */
  events: GeoRecord[];
  /** Forecast markets/questions, by probability desc then recency. */
  forecasts: GeoRecord[];
  /** Macro-context indicators (World Bank / IMF), by country. */
  macro: GeoRecord[];
}

const KIND_ORDER: GeoKind[] = ["conflict", "humanitarian", "disaster", "forecast", "macro"];

function ts(r: GeoRecord): number {
  const t = r.ts ? Date.parse(r.ts) : NaN;
  return isNaN(t) ? 0 : t;
}

export function aggregateGeopolitics(results: GeoResult[], limit = 120): GeopoliticsAggregate {
  const sources = results.map((r) => r.status);

  // De-duplicate across sources by uid (falling back to url|title).
  const seen = new Set<string>();
  const all: GeoRecord[] = [];
  for (const rec of results.flatMap((r) => r.records)) {
    const k = (rec.uid || rec.url || rec.title || "").toLowerCase();
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    all.push(rec);
  }

  const events = all
    .filter((r) => r.kind === "conflict" || r.kind === "humanitarian" || r.kind === "disaster")
    .sort((a, b) => ts(b) - ts(a));
  const forecasts = all
    .filter((r) => r.kind === "forecast")
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || ts(b) - ts(a));
  const macro = all
    .filter((r) => r.kind === "macro")
    .sort((a, b) => (a.country || "").localeCompare(b.country || "") || a.source.localeCompare(b.source));

  // By region (fixed order from REGIONS so the UI is stable).
  const regionCounts = new Map<string, number>();
  for (const r of all) regionCounts.set(r.region, (regionCounts.get(r.region) || 0) + 1);
  const byRegion: RegionCount[] = REGIONS.map((r) => ({
    key: r.key, label: r.label, count: regionCounts.get(r.key) || 0,
  }));

  // By kind (fixed order).
  const kindCounts = new Map<GeoKind, number>();
  for (const r of all) kindCounts.set(r.kind, (kindCounts.get(r.kind) || 0) + 1);
  const byKind: KindCount[] = KIND_ORDER.filter((k) => kindCounts.get(k)).map((kind) => ({
    kind, count: kindCounts.get(kind) || 0,
  }));

  return {
    total: all.length,
    sources,
    byRegion,
    byKind,
    events: events.slice(0, limit),
    forecasts: forecasts.slice(0, 40),
    macro: macro.slice(0, 40),
  };
}
