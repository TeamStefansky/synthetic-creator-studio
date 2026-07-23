// Geopolitics + forecast layer - the catalog's "situational picture" sources,
// connected via official public endpoints only (CLAUDE.md data-sources rule).
// Every source declares its access model and returns a normalized GeoRecord plus
// a connection status; an unavailable/unauthorized source reports connected:false
// (rendered "not connected"), never simulated. Failure of one source never
// aborts the batch. Records are events/forecasts about places and organizations -
// never claims about private individuals (rule 1).
//
// Keyless (live everywhere): UCDP, ReliefWeb, USGS, NASA EONET, Polymarket,
// Metaculus. Key-gated (free registration): ACLED.

import { getJson } from "@/lib/http";
import type { SourceStatus } from "./narrative/types";

export type GeoKind = "conflict" | "humanitarian" | "disaster" | "forecast";

export interface GeoRecord {
  uid: string;
  source: string;
  kind: GeoKind;
  ts?: string;         // ISO 8601 when available
  title: string;
  url?: string;
  country?: string;
  region: string;      // region key (see REGIONS) or "global"
  score?: number | null;
  scoreKind?: string;  // fatalities | magnitude | probability
}

export interface GeoResult {
  status: SourceStatus;
  records: GeoRecord[];
}

// ---- region tagging (ported from the catalog config) -------------------------

export interface Region {
  key: string;
  label: string;
  countries: string[];
  terms: string[];
}

export const REGIONS: Region[] = [
  {
    key: "israel_me",
    label: "Israel & Middle East",
    countries: ["Israel", "Lebanon", "Iran", "Syria", "Gaza", "Palestine", "Palestinian", "Egypt",
      "Jordan", "Saudi Arabia", "Yemen", "Iraq", "Turkey", "Qatar", "UAE", "United Arab Emirates"],
    terms: ["israel", "gaza", "hezbollah", "hamas", "iran", "middle east", "west bank"],
  },
  {
    key: "europe_us",
    label: "Europe & US",
    countries: ["United States", "USA", "Ukraine", "Russia", "Germany", "France",
      "United Kingdom", "Poland", "Italy", "Spain", "Netherlands", "Belgium"],
    terms: ["ukraine", "russia", "nato", "european union", "united states", "putin", "biden", "trump"],
  },
  {
    key: "global",
    label: "Global",
    countries: [],
    terms: [],
  },
];

/** Tag a free-text/country string to a region key (first match wins; else global). */
export function matchRegion(text?: string): string {
  const hay = (text || "").toLowerCase();
  if (!hay) return "global";
  for (const r of REGIONS) {
    if (r.key === "global") continue;
    if (r.countries.some((c) => hay.includes(c.toLowerCase()))) return r.key;
    if (r.terms.some((t) => hay.includes(t))) return r.key;
  }
  return "global";
}

const UA = "TruthLens/0.1 (geopolitics situational monitoring)";

interface GeoSource {
  name: string;
  available(): boolean;
  reason?: string;
  fetch(limit: number): Promise<GeoRecord[]>;
}

// ---- keyless sources ---------------------------------------------------------

const ucdp: GeoSource = {
  name: "ucdp",
  available: () => true,
  async fetch(limit) {
    const url = `https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=${Math.min(1000, limit)}&page=0`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.Result || []).map((ev: any): GeoRecord => {
      const country = ev.country || "";
      return {
        uid: `ucdp:${ev.id ?? `${ev.side_a}-${ev.side_b}-${ev.date_start}`}`,
        source: "ucdp", kind: "conflict", ts: ev.date_start ? String(ev.date_start) : undefined,
        title: `${ev.type_of_violence_name || "Violence"}: ${ev.side_a || "?"} vs ${ev.side_b || "?"} — ${country}`,
        country, region: matchRegion(country),
        score: Number(ev.best) || 0, scoreKind: "fatalities",
      };
    });
  },
};

const reliefweb: GeoSource = {
  name: "reliefweb",
  available: () => true,
  async fetch(limit) {
    const url = `https://api.reliefweb.int/v1/reports?appname=truthlens&limit=${limit}&sort[]=date:desc&fields[include][]=title&fields[include][]=date&fields[include][]=url&fields[include][]=primary_country`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.data || []).map((item: any): GeoRecord => {
      const f = item.fields || {};
      const country = f.primary_country?.name || "";
      return {
        uid: `reliefweb:${item.id ?? f.url}`,
        source: "reliefweb", kind: "humanitarian", ts: f.date?.created,
        title: f.title || "", url: f.url, country, region: matchRegion(country),
      };
    });
  },
};

const usgs: GeoSource = {
  name: "usgs",
  available: () => true,
  async fetch() {
    const url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson";
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.features || []).map((feat: any): GeoRecord => {
      const p = feat.properties || {};
      const place = p.place || "";
      return {
        uid: `usgs:${feat.id}`,
        source: "usgs", kind: "disaster",
        ts: p.time ? new Date(p.time).toISOString() : undefined,
        title: `M${p.mag} earthquake — ${place}`, url: p.url, country: place,
        region: matchRegion(place), score: p.mag, scoreKind: "magnitude",
      };
    });
  },
};

const eonet: GeoSource = {
  name: "eonet",
  available: () => true,
  async fetch(limit) {
    const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=${limit}`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.events || []).map((e: any): GeoRecord => {
      const g = e.geometry?.[e.geometry.length - 1];
      const cat = e.categories?.[0]?.title || "Natural event";
      return {
        uid: `eonet:${e.id}`,
        source: "eonet", kind: "disaster", ts: g?.date,
        title: `${cat}: ${e.title}`, url: e.link || e.sources?.[0]?.url,
        region: matchRegion(e.title),
      };
    });
  },
};

const polymarket: GeoSource = {
  name: "polymarket",
  available: () => true,
  async fetch(limit) {
    const GEO_TERMS = ["war", "ceasefire", "election", "sanction", "nato", "invade", "invasion",
      "strike", "nuclear", "president", "prime minister", "treaty", "border",
      "israel", "iran", "russia", "ukraine", "china", "taiwan", "gaza", "hezbollah"];
    const url = `https://gamma-api.polymarket.com/markets?closed=false&order=volume24hr&ascending=false&limit=${limit * 3}`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    const out: GeoRecord[] = [];
    for (const m of Array.isArray(data) ? data : []) {
      const q = (m.question || "").toLowerCase();
      if (!GEO_TERMS.some((t) => q.includes(t))) continue;
      let prob: number | null = null;
      try {
        const prices = JSON.parse(m.outcomePrices || "[]");
        prob = prices.length ? Number(prices[0]) : null;
      } catch { prob = null; }
      out.push({
        uid: `polymarket:${m.slug || m.id}`,
        source: "polymarket", kind: "forecast", ts: m.endDate || m.startDate,
        title: m.question || "", url: `https://polymarket.com/market/${m.slug || ""}`,
        region: matchRegion(m.question || ""), score: prob, scoreKind: "probability",
      });
      if (out.length >= limit) break;
    }
    return out;
  },
};

const metaculus: GeoSource = {
  name: "metaculus",
  available: () => true,
  async fetch(limit) {
    const url = `https://www.metaculus.com/api2/questions/?search=geopolitics&order_by=-activity&limit=${limit}&forecast_type=binary`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.results || []).map((q: any): GeoRecord => {
      let prob: number | null = null;
      try {
        prob = q.question?.aggregations?.recency_weighted?.latest?.centers?.[0] ?? null;
      } catch { prob = null; }
      const title = q.title || "";
      return {
        uid: `metaculus:${q.id}`,
        source: "metaculus", kind: "forecast", ts: q.created_at || q.published_at,
        title, url: `https://www.metaculus.com/questions/${q.id}/`,
        region: matchRegion(title), score: prob, scoreKind: "probability",
      };
    });
  },
};

// ---- key-gated source --------------------------------------------------------

const acled: GeoSource = {
  name: "acled",
  available: () => !!(process.env.ACLED_KEY && process.env.ACLED_EMAIL),
  reason: "Set ACLED_KEY + ACLED_EMAIL (free registration at acleddata.com / myACLED).",
  async fetch(limit) {
    const key = process.env.ACLED_KEY!;
    const email = process.env.ACLED_EMAIL!;
    const url = `https://api.acleddata.com/acled/read?key=${key}&email=${encodeURIComponent(email)}&limit=${limit}`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.data || []).map((ev: any): GeoRecord => {
      const country = ev.country || "";
      return {
        uid: `acled:${ev.event_id_cnty || ev.data_id}`,
        source: "acled", kind: "conflict", ts: ev.event_date,
        title: `${ev.event_type || "Event"}: ${ev.actor1 || "?"} — ${ev.location || country}`,
        url: ev.source_scale ? undefined : undefined, country, region: matchRegion(country),
        score: Number(ev.fatalities) || 0, scoreKind: "fatalities",
      };
    });
  },
};

export const GEO_SOURCES: GeoSource[] = [ucdp, acled, reliefweb, usgs, eonet, polymarket, metaculus];

/** Run every geopolitics source in parallel, isolating failures. */
export async function collectGeopolitics(limitPer = 60): Promise<GeoResult[]> {
  return Promise.all(GEO_SOURCES.map(async (s): Promise<GeoResult> => {
    if (!s.available()) {
      return { status: { source: s.name, connected: false, reason: s.reason, count: 0 }, records: [] };
    }
    try {
      const records = await s.fetch(limitPer);
      return { status: { source: s.name, connected: true, count: records.length }, records };
    } catch (e: any) {
      return { status: { source: s.name, connected: true, count: 0, error: e?.message || "failed" }, records: [] };
    }
  }));
}
