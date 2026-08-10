// Origin Map - pure helpers behind the "where did this content come from?" view.
//
// The page composes THREE existing capabilities on one world map:
//   1. geographic origin + spread  (/api/mentions, geolocated observations)
//   2. infrastructure origin        (/api/origin-exposure, de-CDN server pins)
//   3. propagation graph            (NetworkGraph over amplifier domains)
//
// Everything here is pure + testable and honors the frozen rules:
//   - Rule 2: the earliest observation is ALWAYS carried with EARLIEST_LABEL - it
//     is "earliest observed", never "the true source". The label is not optional.
//   - Rule 1 / no-person-nodes: the amplifier graph contains ONLY the term and
//     publisher DOMAIN nodes - never an account handle or a person.
//   - Rule 3: infrastructure pins carry the report's confidence + evidence + an
//     innocent alternative (a candidate IP is often a shared host / relay).
//   - Rule 7: nothing is invented; callers render honest "not connected" states
//     when a layer produced no data.

import { centroidForCountry } from "./mentions-map";
import { countryName, flagEmoji } from "./countries";
import type { MapMention } from "./mentions-map";
import type { OperatorNetwork, GraphNode, GraphEdge } from "./types";
import type { OriginExposureReport } from "./origin-exposure";

/** Rule 2 - mandatory label on every earliest/origin marker. Not optional UI text. */
export const EARLIEST_LABEL =
  "earliest observed in collected data - not the true source";

/** Innocent alternative for an infrastructure origin pin (rule 3). */
export const ORIGIN_SERVER_ALT =
  "A resolved non-CDN address is frequently a shared host, mail/analytics box, or relay - not necessarily the live origin server.";

/** Does the input look like a URL / domain (→ infrastructure layer) rather than a
 * free-text topic/term? No spaces + a dotted host, or an http(s) scheme. */
export function looksLikeUrl(input: string): boolean {
  const t = (input || "").trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/i.test(t);
}

/** Registrable hostname from a URL or bare domain ("" when unparseable). */
export function toDomain(input: string): string {
  const t = (input || "").trim();
  if (!t) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return t.replace(/^www\./, "").toLowerCase();
  }
}

/** Hostname of a mention's URL, normalized ("" when none). Outlet-level only. */
export function domainOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** A single plottable observation on the map. */
export interface MapPoint {
  idx: number;
  lat: number;
  lon: number;
  timestamp?: string;
  /** epoch ms of the timestamp, or null when the mention has no usable date. */
  time: number | null;
}

/** Every geolocated mention as a plottable point, in the mentions' own order. */
export function plottablePoints(mentions: MapMention[]): MapPoint[] {
  const out: MapPoint[] = [];
  mentions.forEach((m, idx) => {
    if (typeof m.lat !== "number" || typeof m.lon !== "number") return;
    const t = m.timestamp ? Date.parse(m.timestamp) : NaN;
    out.push({ idx, lat: m.lat, lon: m.lon, timestamp: m.timestamp, time: Number.isNaN(t) ? null : t });
  });
  return out;
}

/**
 * The earliest-OBSERVED plottable mention (rule 2). Returns the point with the
 * smallest valid timestamp that also has coordinates, or null when no dated,
 * geolocated observation exists. NEVER call this "the origin" - see EARLIEST_LABEL.
 */
export function earliestObserved(mentions: MapMention[]): MapPoint | null {
  let best: MapPoint | null = null;
  for (const p of plottablePoints(mentions)) {
    if (p.time === null) continue;
    if (!best || (best.time !== null && p.time < best.time)) best = p;
  }
  return best;
}

/** The [min,max] epoch-ms span of dated observations (null when none dated). */
export function timeSpan(mentions: MapMention[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of plottablePoints(mentions)) {
    if (p.time === null) continue;
    if (p.time < lo) lo = p.time;
    if (p.time > hi) hi = p.time;
  }
  return lo === Infinity ? null : [lo, hi];
}

/** An infrastructure-origin pin resolved behind a CDN (de-CDN result). */
export interface OriginServerPoint {
  ip: string;
  country?: string;
  countryLabel: string;
  flag: string;
  provider?: string;
  lat: number;
  lon: number;
}

/**
 * Pin the resolved origin-server candidates on the map. Only candidates whose
 * country resolves to a centroid are plottable; the rest are surfaced in the
 * evidence table by the caller (honest - never invented coordinates). A small
 * deterministic jitter keeps co-located pins distinct.
 */
export function originServerPoints(report: OriginExposureReport | null): OriginServerPoint[] {
  if (!report || !report.candidates?.length) return [];
  const out: OriginServerPoint[] = [];
  report.candidates.forEach((c, i) => {
    const geo = centroidForCountry(c.country);
    if (!geo) return;
    out.push({
      ip: c.ip,
      country: c.country,
      countryLabel: c.country ? countryName(c.country) || c.country : "unknown",
      flag: c.country ? flagEmoji(c.country) : "",
      provider: c.provider || c.org,
      lat: geo.lat + ((i % 3) - 1) * 1.6,
      lon: geo.lon + ((i % 2 === 0 ? 1 : -1) * (i % 3)) * 1.6,
    });
  });
  return out;
}

/**
 * Reusable origin-network builder (extracted from the Origin Exposure page so both
 * pages share ONE source of truth). Domain → exposed/historical subdomains →
 * exposed/historical origin IPs (geolocation on each IP label). Shared IPs link
 * multiple names automatically. Infrastructure only - never a person node.
 */
export function buildOriginExposureNetwork(report: OriginExposureReport | null): OperatorNetwork {
  if (!report) return { nodes: [], edges: [] };
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, reason: string) => {
    const k = `${source}|${target}|${reason}`;
    if (source === target || seen.has(k)) return;
    seen.add(k);
    edges.push({ source, target, reason });
  };
  const ipLabel = (ip: string, country?: string, city?: string) => {
    const loc = [city, country && (countryName(country) || country)].filter(Boolean).join(", ");
    return loc ? `${ip}  ${flagEmoji(country)} ${loc}` : ip;
  };

  const dom = report.domain;
  nodes.set(dom, { id: dom, label: dom, kind: "target" });
  for (const r of report.exposed) {
    const nameId = r.name && r.name !== dom ? r.name : dom;
    if (nameId !== dom) {
      nodes.set(nameId, { id: nameId, label: r.name, kind: "domain" });
      addEdge(dom, nameId, "subdomain");
    }
    const ipId = `ip:${r.ip}`;
    nodes.set(ipId, { id: ipId, label: ipLabel(r.ip, r.country, r.city), kind: "ip", flaggedFake: true });
    addEdge(nameId, ipId, r.source || "resolves outside CDN");
  }
  for (const h of report.historical.candidates) {
    const ipId = `ip:${h.ip}`;
    if (!nodes.has(ipId)) nodes.set(ipId, { id: ipId, label: ipLabel(h.ip, h.country, h.city), kind: "ip" });
    addEdge(dom, ipId, "historical origin");
  }
  return { nodes: [...nodes.values()], edges };
}

/** One amplifier domain: how many collected mentions came from it. */
export interface AmplifierDomain {
  domain: string;
  count: number;
}

/**
 * The propagation / amplifier graph: which publisher DOMAINS carried the content,
 * linked to the searched term. Nodes are the term (target) + publisher domains
 * ONLY - never an account handle or a person (rule 1 / no-person-nodes). An edge
 * means "appeared in collected mentions", a co-appearance observation, NOT proof
 * of coordination. Domains are ranked by mention count; `limit` caps clutter.
 */
export function buildAmplifierNetwork(
  term: string,
  mentions: MapMention[],
  limit = 40,
): { network: OperatorNetwork; domains: AmplifierDomain[] } {
  const counts = new Map<string, number>();
  for (const m of mentions) {
    const d = domainOf(m.url);
    if (!d) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  const ranked: AmplifierDomain[] = [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  if (!ranked.length) return { network: { nodes: [], edges: [] }, domains: [] };

  const target = (term || "content").trim();
  const nodes: GraphNode[] = [{ id: `term:${target}`, label: target, kind: "target" }];
  const edges: GraphEdge[] = [];
  for (const d of ranked) {
    nodes.push({ id: d.domain, label: d.domain, kind: "domain" });
    edges.push({
      source: `term:${target}`,
      target: d.domain,
      reason: `appeared in ${d.count} collected mention${d.count === 1 ? "" : "s"}`,
    });
  }
  return { network: { nodes, edges }, domains: ranked };
}
