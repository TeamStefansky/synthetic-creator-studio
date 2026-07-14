// Access-log analyzer.
//
// Parses Apache/Nginx "combined" logs or generic CSV that a user OWNS or is
// AUTHORIZED to inspect, enriches each unique client IP, and flags hostile
// origins and bot-farm signatures. It reconstructs a per-IP "content path"
// (the ordered sequence of URLs a visitor hit) and a request-volume timeline.
//
// This never fetches anyone else's logs — it only analyzes text the user
// supplies.

import { enrichIps, isPrivateIp } from "./geoenrich";
import type { EnrichedIp, LogAnalysis, LogIpRow } from "./types";

interface ParsedLine {
  ip: string;
  timestamp: string | null; // ISO
  method: string | null;
  path: string | null;
  status: number | null;
  bytes: number | null;
  userAgent: string | null;
  referer: string | null;
}

// Apache/Nginx combined:
// IP - - [10/Oct/2023:13:55:36 -0700] "GET /path HTTP/1.1" 200 2326 "ref" "UA"
const COMBINED_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+[^"]*"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

// A looser variant without the referer/UA quotes.
const COMMON_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+[^"]*"\s+(\d{3})\s+(\d+|-)/;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** Parse an Apache time like "10/Oct/2023:13:55:36 -0700" to ISO. */
function parseApacheTime(s: string): string | null {
  const m = s.match(
    /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/
  );
  if (!m) return null;
  const [, dd, mon, yyyy, hh, mm, ss, tz] = m;
  const month = MONTHS[mon];
  if (!month) return null;
  const offset = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "Z";
  const iso = `${yyyy}-${month}-${dd}T${hh}:${mm}:${ss}${offset}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function parseCsvLine(line: string): ParsedLine | null {
  // Generic CSV: try to find an IP-looking token and a timestamp-looking token.
  const cols = line.split(/,|\t/).map((c) => c.trim().replace(/^"|"$/g, ""));
  const ip = cols.find((c) => IPV4.test(c) || (c.includes(":") && IPV6.test(c)));
  if (!ip) return null;
  let timestamp: string | null = null;
  for (const c of cols) {
    const d = new Date(c);
    if (!Number.isNaN(d.getTime()) && /\d{4}|\d{2}:\d{2}/.test(c)) {
      timestamp = d.toISOString();
      break;
    }
  }
  const path = cols.find((c) => c.startsWith("/")) ?? null;
  const status = cols.find((c) => /^\d{3}$/.test(c));
  return {
    ip,
    timestamp,
    method: null,
    path,
    status: status ? Number(status) : null,
    bytes: null,
    userAgent: cols.find((c) => /Mozilla|bot|curl|python|Go-http/i.test(c)) ?? null,
    referer: null,
  };
}

function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let m = trimmed.match(COMBINED_RE);
  if (m) {
    return {
      ip: m[1],
      timestamp: parseApacheTime(m[2]),
      method: m[3],
      path: m[4],
      status: Number(m[5]),
      bytes: m[6] === "-" ? null : Number(m[6]),
      referer: m[7] || null,
      userAgent: m[8] || null,
    };
  }
  m = trimmed.match(COMMON_RE);
  if (m) {
    return {
      ip: m[1],
      timestamp: parseApacheTime(m[2]),
      method: m[3],
      path: m[4],
      status: Number(m[5]),
      bytes: m[6] === "-" ? null : Number(m[6]),
      referer: null,
      userAgent: null,
    };
  }
  // Fall back to CSV/loose parsing.
  return parseCsvLine(trimmed);
}

/**
 * If a line carries an X-Forwarded-For value (some CSV exports include it),
 * the left-most public IP is the real client behind a proxy. This helper is
 * applied when a header column is detected.
 */
function realClientFromXff(xff: string): string | null {
  const parts = xff.split(",").map((p) => p.trim());
  for (const p of parts) {
    if (IPV4.test(p) && !isPrivateIp(p)) return p;
  }
  return null;
}

const MAX_PATHS_PER_IP = 40;
const MAX_UA_PER_IP = 8;

export async function analyzeLog(raw: string): Promise<LogAnalysis> {
  const lines = raw.split(/\r?\n/);
  let parsedRequests = 0;
  let malformed = 0;

  // Detect an X-Forwarded-For column in a CSV header, if present.
  const header = lines[0]?.toLowerCase() ?? "";
  const xffIdx =
    header.includes("x-forwarded-for") || header.includes("xff")
      ? header.split(/,|\t/).findIndex((h) => /x-forwarded-for|xff/.test(h))
      : -1;

  interface Agg {
    requests: number;
    firstSeen: number | null;
    lastSeen: number | null;
    userAgents: Map<string, number>;
    paths: string[];
    contentPath: { path: string; at: string | null }[];
    statuses: number[];
    times: number[];
  }
  const byIp = new Map<string, Agg>();
  const uaToIps = new Map<string, Set<string>>();
  const timeBuckets = new Map<string, number>(); // hour bucket -> count

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Skip an obvious CSV header row.
    if (i === 0 && xffIdx >= 0) continue;

    const parsed = parseLine(line);
    if (!parsed || !parsed.ip) {
      malformed++;
      continue;
    }

    // Recover the real client from XFF if that column exists.
    let ip = parsed.ip;
    if (xffIdx >= 0) {
      const cols = line.split(/,|\t/);
      const xff = cols[xffIdx]?.replace(/"/g, "").trim();
      if (xff) ip = realClientFromXff(xff) ?? ip;
    }

    parsedRequests++;
    let agg = byIp.get(ip);
    if (!agg) {
      agg = {
        requests: 0,
        firstSeen: null,
        lastSeen: null,
        userAgents: new Map(),
        paths: [],
        contentPath: [],
        statuses: [],
        times: [],
      };
      byIp.set(ip, agg);
    }
    agg.requests++;
    if (parsed.status !== null) agg.statuses.push(parsed.status);

    const t = parsed.timestamp ? new Date(parsed.timestamp).getTime() : null;
    if (t !== null && !Number.isNaN(t)) {
      agg.times.push(t);
      agg.firstSeen = agg.firstSeen === null ? t : Math.min(agg.firstSeen, t);
      agg.lastSeen = agg.lastSeen === null ? t : Math.max(agg.lastSeen, t);
      const bucket = new Date(parsed.timestamp!).toISOString().slice(0, 13); // hour
      timeBuckets.set(bucket, (timeBuckets.get(bucket) ?? 0) + 1);
    }

    if (parsed.userAgent) {
      agg.userAgents.set(
        parsed.userAgent,
        (agg.userAgents.get(parsed.userAgent) ?? 0) + 1
      );
      let set = uaToIps.get(parsed.userAgent);
      if (!set) {
        set = new Set();
        uaToIps.set(parsed.userAgent, set);
      }
      set.add(ip);
    }
    if (parsed.path) {
      if (agg.paths.length < MAX_PATHS_PER_IP && !agg.paths.includes(parsed.path))
        agg.paths.push(parsed.path);
      if (agg.contentPath.length < MAX_PATHS_PER_IP)
        agg.contentPath.push({ path: parsed.path, at: parsed.timestamp });
    }
  }

  // ---- Enrich unique IPs --------------------------------------------------
  const uniqueIps = Array.from(byIp.keys());
  const enriched = await enrichIps(uniqueIps);
  const enrichmentAvailable = Array.from(enriched.values()).some(
    (e) => e.enriched
  );

  // ---- Bot user-agent signatures (same UA across many distinct IPs) -------
  const botUserAgents = Array.from(uaToIps.entries())
    .map(([userAgent, ips]) => ({ userAgent, ipCount: ips.size }))
    .filter((x) => x.ipCount >= 5)
    .sort((a, b) => b.ipCount - a.ipCount)
    .slice(0, 15);
  const botUaSet = new Set(botUserAgents.map((b) => b.userAgent));

  // ---- Build rows + per-IP flags -----------------------------------------
  const rows: LogIpRow[] = uniqueIps.map((ip) => {
    const agg = byIp.get(ip)!;
    const info: EnrichedIp = enriched.get(ip) ?? {
      ip,
      country: null, city: null, asn: null, asnOrg: null,
      isDatacenter: false, isCdn: false, cdnProvider: null,
      ptr: null, adversary: false, enriched: false,
    };
    const flags: string[] = [];

    if (info.adversary)
      flags.push(`Adversary-country origin (${info.country})`);
    if (info.isDatacenter)
      flags.push("Datacenter/hosting ASN (likely automation, not a real reader)");

    // Duplicate UA across many IPs => bot-farm member.
    for (const [ua] of agg.userAgents) {
      if (botUaSet.has(ua)) {
        flags.push("Shares a User-Agent seen across many IPs (bot-farm signature)");
        break;
      }
    }

    // Burst detection: many requests in a very short window.
    if (agg.times.length >= 20 && agg.firstSeen && agg.lastSeen) {
      const spanMin = (agg.lastSeen - agg.firstSeen) / 60000;
      const rate = spanMin > 0 ? agg.requests / spanMin : agg.requests;
      if (rate > 60)
        flags.push(`High request rate (~${Math.round(rate)}/min — synchronized burst)`);
    }

    // Sequential path scanning: many distinct paths, mostly errors.
    const err = agg.statuses.filter((s) => s >= 400).length;
    if (agg.paths.length >= 25 && err / Math.max(1, agg.statuses.length) > 0.5)
      flags.push("Sequential path-scanning pattern (many paths, mostly errors)");

    return {
      ip,
      requests: agg.requests,
      firstSeen: agg.firstSeen ? new Date(agg.firstSeen).toISOString() : null,
      lastSeen: agg.lastSeen ? new Date(agg.lastSeen).toISOString() : null,
      userAgents: Array.from(agg.userAgents.keys()).slice(0, MAX_UA_PER_IP),
      paths: agg.paths,
      flags,
      info,
      contentPath: agg.contentPath,
    };
  });

  rows.sort((a, b) => b.requests - a.requests);

  // ---- Aggregates ---------------------------------------------------------
  const totalReq = parsedRequests || 1;
  const dcRequests = rows
    .filter((r) => r.info.isDatacenter)
    .reduce((s, r) => s + r.requests, 0);
  const adversaryIpCount = rows.filter((r) => r.info.adversary).length;
  const suspectedBotIpCount = rows.filter((r) =>
    r.flags.some((f) => /bot-farm|Datacenter|burst|scanning/i.test(f))
  ).length;

  const countryMap = new Map<string, number>();
  for (const r of rows) {
    const c = r.info.country ?? "Unknown";
    countryMap.set(c, (countryMap.get(c) ?? 0) + r.requests);
  }
  const countryBreakdown = Array.from(countryMap.entries())
    .map(([country, requests]) => ({ country, requests }))
    .sort((a, b) => b.requests - a.requests);

  // Timeline with burst highlighting (bucket > 3x median).
  const bucketEntries = Array.from(timeBuckets.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const counts = bucketEntries.map(([, c]) => c).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const timeline = bucketEntries.map(([bucket, requests]) => ({
    bucket: bucket.replace("T", " ") + ":00",
    requests,
    burst: median > 0 && requests > median * 3,
  }));

  return {
    totalLines: lines.filter((l) => l.trim()).length,
    parsedRequests,
    malformedLines: malformed,
    uniqueIps: uniqueIps.length,
    datacenterPct: Math.round((dcRequests / totalReq) * 100),
    adversaryIpCount,
    suspectedBotIpCount,
    countryBreakdown,
    timeline,
    rows: rows.slice(0, 200), // cap for payload size
    botUserAgents,
    enrichmentAvailable,
  };
}
