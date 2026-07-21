// Access-log analyzer. Works ONLY on logs the user owns or is authorized to
// inspect - there is NO third-party log access here. Parses Apache/Nginx
// "combined" format and generic CSV, enriches unique IPs, and flags bot/farm
// and adversary-origin signals plus reconstructs each visitor's content path.

import { enrichIp } from "./ip";
import type {
  LogEntry,
  IpAggregate,
  LogAnalysisResult,
  LogFlag,
  IpEnrichment,
} from "./types";

// Apache/Nginx combined:
// 1.2.3.4 - - [10/Oct/2023:13:55:36 +0000] "GET /path HTTP/1.1" 200 1234 "ref" "ua"
const COMBINED_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+[^"]*"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseApacheDate(s: string): string | undefined {
  // 10/Oct/2023:13:55:36 +0000
  const m = s.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, d, mon, y, h, min, sec] = m;
  const mm = MONTHS[mon];
  if (!mm) return undefined;
  return `${y}-${mm}-${d}T${h}:${min}:${sec}Z`;
}

function parseCombinedLine(line: string): LogEntry | null {
  const m = line.match(COMBINED_RE);
  if (!m) return null;
  const [, ip, ts, method, path, status, bytes, referer, userAgent] = m;
  return {
    ip,
    timestamp: parseApacheDate(ts),
    method,
    path,
    status: Number(status),
    bytes: bytes === "-" ? 0 : Number(bytes),
    referer: referer || undefined,
    userAgent: userAgent || undefined,
  };
}

// Generic CSV with a header row containing recognizable column names.
function parseCsv(text: string): LogEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iIp = idx(["ip", "client_ip", "remote_addr", "clientip"]);
  if (iIp < 0) return [];
  const iTs = idx(["timestamp", "time", "date", "datetime"]);
  const iMethod = idx(["method", "verb"]);
  const iPath = idx(["path", "url", "uri", "request"]);
  const iStatus = idx(["status", "code", "status_code"]);
  const iBytes = idx(["bytes", "size", "body_bytes_sent"]);
  const iUa = idx(["useragent", "user_agent", "ua", "agent"]);
  const iRef = idx(["referer", "referrer"]);
  const iXff = idx(["x-forwarded-for", "x_forwarded_for", "forwarded_for", "xff"]);

  const out: LogEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const ip = (c[iIp] || "").trim();
    if (!ip) continue;
    out.push({
      ip,
      timestamp: iTs >= 0 ? c[iTs]?.trim() : undefined,
      method: iMethod >= 0 ? c[iMethod]?.trim() : undefined,
      path: iPath >= 0 ? c[iPath]?.trim() : undefined,
      status: iStatus >= 0 ? Number(c[iStatus]) : undefined,
      bytes: iBytes >= 0 ? Number(c[iBytes]) : undefined,
      userAgent: iUa >= 0 ? c[iUa]?.trim() : undefined,
      referer: iRef >= 0 ? c[iRef]?.trim() : undefined,
      forwardedFor: iXff >= 0 ? c[iXff]?.trim() : undefined,
    });
  }
  return out;
}

/** Recover the real client behind a proxy from X-Forwarded-For (first hop). */
function resolveClientIp(entry: LogEntry): string {
  if (entry.forwardedFor) {
    const first = entry.forwardedFor.split(",")[0]?.trim();
    if (first && /^\d+\.\d+\.\d+\.\d+$/.test(first)) return first;
  }
  return entry.ip;
}

async function enrichBatch(ips: string[]): Promise<Map<string, IpEnrichment>> {
  const out = new Map<string, IpEnrichment>();
  const CONCURRENCY = 5; // respect ipinfo / ip-api throttles
  for (let i = 0; i < ips.length; i += CONCURRENCY) {
    const slice = ips.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((ip) => enrichIp(ip)));
    results.forEach((r) => out.set(r.ip, r));
  }
  return out;
}

export async function analyzeLog(raw: string): Promise<LogAnalysisResult> {
  const lines = raw.split(/\r?\n/);
  const isCsv = /^[^\n]*\b(ip|client_ip|remote_addr)\b[^\n]*,/i.test(lines[0] || "");

  const entries: LogEntry[] = [];
  let skipped = 0;

  if (isCsv) {
    const parsed = parseCsv(raw);
    entries.push(...parsed);
    skipped = Math.max(0, lines.filter((l) => l.trim()).length - 1 - parsed.length);
  } else {
    for (const line of lines) {
      if (!line.trim()) continue;
      const e = parseCombinedLine(line);
      if (e) entries.push(e);
      else skipped++;
    }
  }

  const totalRequests = entries.length;

  // Aggregate by resolved client IP.
  const agg = new Map<string, IpAggregate>();
  const countryReq = new Map<string, number>();
  const uaToIps = new Map<string, Set<string>>();

  for (const e of entries) {
    const ip = resolveClientIp(e);
    let a = agg.get(ip);
    if (!a) {
      a = {
        ip,
        requests: 0,
        enrichment: { ip, hostingType: "unknown", isAdversary: false },
        userAgents: [],
        flags: [],
        reasons: [],
        contentPath: [],
      };
      agg.set(ip, a);
    }
    a.requests++;
    if (e.userAgent && !a.userAgents.includes(e.userAgent)) a.userAgents.push(e.userAgent);
    if (e.path) a.contentPath.push({ path: e.path, timestamp: e.timestamp, status: e.status });
    if (e.userAgent) {
      if (!uaToIps.has(e.userAgent)) uaToIps.set(e.userAgent, new Set());
      uaToIps.get(e.userAgent)!.add(ip);
    }
  }

  // Enrich the most active IPs (cap to respect rate limits).
  const ranked = Array.from(agg.values()).sort((a, b) => b.requests - a.requests);
  const ENRICH_CAP = 60;
  const toEnrich = ranked.slice(0, ENRICH_CAP).map((a) => a.ip);
  const enrichMap = await enrichBatch(toEnrich);

  // User-agents shared across many IPs (bot-farm signature).
  const sharedUserAgents = Array.from(uaToIps.entries())
    .filter(([, ips]) => ips.size >= 5)
    .map(([userAgent, ips]) => ({ userAgent, ipCount: ips.size }))
    .sort((a, b) => b.ipCount - a.ipCount)
    .slice(0, 20);
  const sharedUaSet = new Set(sharedUserAgents.map((s) => s.userAgent));

  let datacenterIps = 0;
  let adversaryIps = 0;
  let botIps = 0;

  for (const a of ranked) {
    const enr = enrichMap.get(a.ip);
    if (enr) a.enrichment = enr;

    // sort the content path chronologically
    a.contentPath.sort((x, y) => (x.timestamp || "").localeCompare(y.timestamp || ""));

    const flags: LogFlag[] = [];
    const reasons: string[] = [];

    if (a.enrichment.isAdversary) {
      flags.push("adversary_country");
      reasons.push(`Origin country ${a.enrichment.country} is in the adversary list.`);
      adversaryIps++;
    }
    if (a.enrichment.hostingType === "datacenter") {
      flags.push("datacenter_asn");
      reasons.push(`Datacenter/hosting ASN (${a.enrichment.asnOrg || "?"}) - likely a bot, not a real reader.`);
      datacenterIps++;
    }
    if (a.userAgents.some((ua) => sharedUaSet.has(ua))) {
      flags.push("shared_user_agent");
      reasons.push("Uses a User-Agent seen across many distinct IPs (bot-farm signature).");
    }
    // crude high-rate flag: many requests with very few distinct paths
    const distinctPaths = new Set(a.contentPath.map((p) => p.path)).size;
    if (a.requests >= 100) {
      flags.push("high_rate");
      reasons.push(`High request volume (${a.requests}).`);
    }
    if (a.requests >= 20 && distinctPaths >= a.requests * 0.8) {
      flags.push("path_scanning");
      reasons.push(`Sequential path-scanning pattern (${distinctPaths} distinct paths).`);
    }

    a.flags = flags;
    a.reasons = reasons;
    if (flags.includes("datacenter_asn") || flags.includes("shared_user_agent")) botIps++;

    if (a.enrichment.country) {
      countryReq.set(a.enrichment.country, (countryReq.get(a.enrichment.country) || 0) + a.requests);
    }
  }

  // Timeline: bucket by hour, flag bursts (>2x median).
  const buckets = new Map<string, number>();
  for (const e of entries) {
    if (!e.timestamp) continue;
    const bucket = e.timestamp.slice(0, 13); // YYYY-MM-DDTHH
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }
  const bucketArr = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const counts = bucketArr.map(([, c]) => c).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const timeline = bucketArr.map(([bucket, requests]) => ({
    bucket,
    requests,
    burst: median > 0 && requests > median * 2.5,
  }));

  const uniqueIps = agg.size;
  const enrichedCount = Math.min(uniqueIps, ENRICH_CAP);
  const datacenterPct = enrichedCount > 0 ? Math.round((datacenterIps / enrichedCount) * 100) : 0;

  const countryBreakdown = Array.from(countryReq.entries())
    .map(([country, requests]) => ({ country, requests }))
    .sort((a, b) => b.requests - a.requests);

  return {
    totalRequests,
    parsedLines: entries.length,
    skippedLines: skipped,
    uniqueIps,
    datacenterPct,
    adversaryIpCount: adversaryIps,
    suspectedBotIpCount: botIps,
    countryBreakdown,
    timeline,
    topIps: ranked.slice(0, 50),
    sharedUserAgents,
    note:
      uniqueIps > ENRICH_CAP
        ? `Enriched the top ${ENRICH_CAP} IPs by volume to respect API rate limits; ${uniqueIps - ENRICH_CAP} lower-volume IPs were aggregated but not geo-enriched.`
        : "All unique IPs enriched.",
  };
}
