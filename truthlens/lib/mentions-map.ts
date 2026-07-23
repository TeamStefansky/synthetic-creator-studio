// Brand-mentions aggregation - "where does my brand appear?". Pure, testable.
// Takes the per-source results from collectMentions() and produces a de-duplicated,
// most-recent-first list plus a by-source and by-country (geographic) breakdown.
// Public data only; a mention is an account/outlet + a public URL, never a claim
// about a private individual (CLAUDE.md rules 1, 5, 7).

import { countryLabel, countryName, flagEmoji } from "./countries";
import { CENTROIDS } from "./geo-centroids";
import type { Mention, SourceStatus } from "./narrative/types";
import type { SourceResult } from "./narrative/sources";

export interface CountryCount {
  key: string;
  label: string;
  flag: string;
  count: number;
  /** Resolved ISO code + centroid for map plotting (absent = unmapped). */
  code?: string;
  lat?: number;
  lon?: number;
}

// GDELT reports source country as a NAME; build a name -> ISO code map from the
// centroid table so names resolve to coordinates. Memoized.
let NAME_TO_CODE: Map<string, string> | null = null;
function nameToCode(): Map<string, string> {
  if (NAME_TO_CODE) return NAME_TO_CODE;
  const m = new Map<string, string>();
  for (const code of Object.keys(CENTROIDS)) {
    const n = countryName(code);
    if (n) m.set(n.toLowerCase(), code);
  }
  NAME_TO_CODE = m;
  return m;
}

/** Resolve a country string (ISO code OR English name) to a centroid. */
export function centroidForCountry(country?: string): { code: string; lat: number; lon: number } | null {
  const c = (country || "").trim();
  if (!c) return null;
  const code = /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : nameToCode().get(c.toLowerCase());
  if (!code || !CENTROIDS[code]) return null;
  const [lat, lon] = CENTROIDS[code];
  return { code, lat, lon };
}

export interface MentionsAggregate {
  total: number;
  /** Per-source connection state + count (rule 7: unconnected shown honestly). */
  sources: SourceStatus[];
  /** Geographic breakdown (where a source country was reported, e.g. GDELT). */
  byCountry: CountryCount[];
  /** How many mentions carried no country (honest "unknown" bucket). */
  countryUnknown: number;
  mentions: Mention[];
}

function isCode(s: string): boolean {
  return /^[A-Za-z]{2}$/.test(s);
}
function labelFor(country: string): string {
  return isCode(country) ? countryLabel(country) : country;
}
function flagFor(country: string): string {
  return isCode(country) ? flagEmoji(country) : "";
}

/** Aggregate per-source mention results into a "where it appears" view. */
export function aggregateMentions(results: SourceResult[], limit = 200): MentionsAggregate {
  const sources = results.map((r) => r.status);

  // De-duplicate across sources by URL (falling back to id).
  const seen = new Set<string>();
  const deduped: Mention[] = [];
  for (const m of results.flatMap((r) => r.mentions)) {
    const k = (m.url || m.id || "").toLowerCase();
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    deduped.push(m);
  }

  // Most-recent first (mentions without a timestamp sort last).
  deduped.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

  const cc = new Map<string, CountryCount>();
  let countryUnknown = 0;
  for (const m of deduped) {
    const country = (m.country || "").trim();
    if (!country) { countryUnknown++; continue; }
    let cur = cc.get(country);
    if (!cur) {
      const geo = centroidForCountry(country);
      cur = { key: country, label: labelFor(country), flag: flagFor(country), count: 0,
        code: geo?.code, lat: geo?.lat, lon: geo?.lon };
      cc.set(country, cur);
    }
    cur.count++;
  }
  const byCountry = [...cc.values()].sort((a, b) => b.count - a.count);

  return { total: deduped.length, sources, byCountry, countryUnknown, mentions: deduped.slice(0, limit) };
}
