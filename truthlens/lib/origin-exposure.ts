// Origin-exposure audit - a DEFENSIVE posture check for a CDN-fronted domain.
//
// Given a domain, it reads ONLY public, passive records - Certificate Transparency
// (crt.sh) plus the current public DNS of common subdomains - and flags any A/AAAA
// record that resolves OUTSIDE the CDN's published ranges as a POSSIBLE origin leak,
// together with hardening guidance. It NEVER connects to, probes, or "verifies a
// bypass" against the origin; it only observes records anyone can query. This keeps
// it a report for a human analyst, not an offensive action (CLAUDE.md rules 5, 6, 8:
// public data only, no offensive tooling, cached + reproducible).
//
// Every finding carries a confidence level, the evidence behind it, and an explicit
// alternative explanation (rule 3): a non-CDN IP is frequently a third-party mail,
// analytics, or parked host - NOT necessarily the live origin.

import { Resolver } from "dns/promises";
import { getText, getJson } from "./http";
import { cacheGet, cacheSet } from "./cache";

const TTL = 24 * 60 * 60 * 1000; // per-day reproducibility
const PUBLIC_RESOLVERS = ["1.1.1.1", "8.8.8.8", "9.9.9.9"];
const MAX_NAMES = 140; // cap total names probed (politeness + bounded runtime)
const CONCURRENCY = 10;

const CF_IPS_V4_URL = "https://www.cloudflare.com/ips-v4";
const CF_IPS_V6_URL = "https://www.cloudflare.com/ips-v6";

// Static fallback if cloudflare.com is unreachable (changes rarely).
const CF_FALLBACK_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
const CF_FALLBACK_V6 = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

// Common subdomains that tend to point straight at the origin (bypassing the CDN).
const DEFAULT_SUBS = [
  "www", "mail", "ftp", "cpanel", "webmail", "smtp", "pop", "imap", "direct",
  "origin", "dev", "staging", "stage", "test", "beta", "api", "admin", "portal",
  "vpn", "remote", "ssh", "server", "host", "ns1", "ns2", "mx", "mx1", "mx2",
  "autodiscover", "autoconfig", "whm", "webdisk", "old", "backup", "app",
  "dashboard", "internal", "corp", "git", "gitlab", "jenkins", "db", "database",
];

export interface OriginExposureRecord {
  name: string;
  ip: string;
  version: "v4" | "v6";
  /** Hosting provider inferred from public RDAP (undefined = not looked up). */
  provider?: string;
  org?: string;
}

/** A de-duplicated candidate IP the OWNER should verify (we never confirm it). */
export interface OriginCandidate {
  ip: string;
  version: "v4" | "v6";
  provider?: string;
  org?: string;
  /** where it surfaced: current DNS, a CT-log hostname, or historical DNS. */
  sources: string[];
}

export interface HistoricalDns {
  available: boolean;
  candidates: { ip: string; firstSeen?: string; lastSeen?: string }[];
  note: string;
}

export type OriginExposureBand =
  | "no_exposure_observed"
  | "possible_exposure"
  | "not_cdn_fronted"
  | "insufficient_data";

export interface OriginExposureReport {
  available: boolean;
  domain: string;
  /** Whether the apex/www appears to sit behind the CDN at all. */
  cdnFronted: boolean;
  cdn: string; // "Cloudflare" | "none detected"
  namesChecked: number;
  /** A/AAAA records resolving OUTSIDE the CDN ranges - possible origin leaks. */
  exposed: OriginExposureRecord[];
  proxiedCount: number;
  uniqueExposedIps: string[];
  /** De-duplicated candidate origins for the owner to verify (enriched). */
  candidates: OriginCandidate[];
  /** Dominant hosting provider among candidates, if any. */
  provider: string | null;
  /** Always false: this tool never actively confirms an origin (defensive). */
  originFound: false;
  /** Historical DNS origin candidates (env-gated SecurityTrails). */
  historical: HistoricalDns;
  band: OriginExposureBand;
  confidence: "Low" | "Medium" | "High";
  /** 0-100 confidence in the EXPOSURE ASSESSMENT (not that a bypass works). */
  confidenceScore: number;
  evidence: string[];
  /** Rule 3: an innocent explanation for the same observation. */
  alternative: string;
  recommendations: string[];
  note: string;
  collectedAt: string;
}

// --- IP-range math (no dependency; handles v4 + v6) ---

function ipv4ToBig(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8n) + BigInt(o);
  }
  return n;
}

function ipv6ToBig(ip: string): bigint | null {
  let s = ip.trim();
  if (s.includes(".")) return null; // no v4-mapped handling needed here
  const dbl = s.split("::");
  if (dbl.length > 2) return null;
  const head = dbl[0] ? dbl[0].split(":") : [];
  const tail = dbl.length === 2 && dbl[1] ? dbl[1].split(":") : [];
  const missing = 8 - (head.length + tail.length);
  if (dbl.length === 1 && head.length !== 8) return null;
  if (dbl.length === 2 && missing < 0) return null;
  const groups = dbl.length === 2 ? [...head, ...Array(missing).fill("0"), ...tail] : head;
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    n = (n << 16n) + BigInt(parseInt(g, 16));
  }
  return n;
}

interface Cidr { base: bigint; bits: number; v: 4 | 6; }

function parseCidr(cidr: string): Cidr | null {
  const [addr, prefix] = cidr.split("/");
  const bits = Number(prefix);
  if (!Number.isInteger(bits)) return null;
  if (addr.includes(":")) {
    const base = ipv6ToBig(addr);
    if (base === null || bits < 0 || bits > 128) return null;
    return { base: base >> BigInt(128 - bits) << BigInt(128 - bits), bits, v: 6 };
  }
  const base = ipv4ToBig(addr);
  if (base === null || bits < 0 || bits > 32) return null;
  return { base: base >> BigInt(32 - bits) << BigInt(32 - bits), bits, v: 4 };
}

export function ipInCidr(ip: string, cidr: Cidr): boolean {
  const isV6 = ip.includes(":");
  if ((isV6 ? 6 : 4) !== cidr.v) return false;
  const n = isV6 ? ipv6ToBig(ip) : ipv4ToBig(ip);
  if (n === null) return false;
  const total = cidr.v === 6 ? 128 : 32;
  const masked = (n >> BigInt(total - cidr.bits)) << BigInt(total - cidr.bits);
  return masked === cidr.base;
}

export function isInRanges(ip: string, ranges: Cidr[]): boolean {
  return ranges.some((c) => ipInCidr(ip, c));
}

/** Convenience: is `ip` inside any of the CIDR strings? (pure; used by tests). */
export function ipInAnyCidr(ip: string, cidrStrings: string[]): boolean {
  const ranges = cidrStrings.map(parseCidr).filter((c): c is Cidr => !!c);
  return isInRanges(ip, ranges);
}

async function loadCloudflareRanges(): Promise<Cidr[]> {
  const out: Cidr[] = [];
  for (const [url, fb] of [
    [CF_IPS_V4_URL, CF_FALLBACK_V4],
    [CF_IPS_V6_URL, CF_FALLBACK_V6],
  ] as const) {
    const txt = await getText(url, { timeoutMs: 10000 });
    const lines = (txt ? txt.split(/\r?\n/) : fb).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const c = parseCidr(line);
      if (c) out.push(c);
    }
  }
  return out;
}

async function crtshNames(domain: string): Promise<string[]> {
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
  const data = await getJson<any[]>(url, { timeoutMs: 25000, headers: { "User-Agent": "TruthLens/0.1 (origin-exposure audit)" } });
  if (!Array.isArray(data)) return [];
  const names = new Set<string>();
  for (const entry of data) {
    for (const field of ["common_name", "name_value"]) {
      const val = String(entry?.[field] || "");
      for (const raw of val.split(/\n/)) {
        const nm = raw.trim().replace(/^\*\./, "").toLowerCase();
        if (nm && nm.endsWith(domain) && !nm.includes(" ")) names.add(nm);
      }
    }
  }
  return [...names];
}

function makeResolver(): Resolver {
  const r = new Resolver({ timeout: 4000, tries: 1 });
  r.setServers(PUBLIC_RESOLVERS);
  return r;
}

async function resolveBoth(r: Resolver, name: string): Promise<{ ip: string; version: "v4" | "v6" }[]> {
  const out: { ip: string; version: "v4" | "v6" }[] = [];
  const [a, aaaa] = await Promise.all([
    r.resolve4(name).catch(() => [] as string[]),
    r.resolve6(name).catch(() => [] as string[]),
  ]);
  for (const ip of a) out.push({ ip, version: "v4" });
  for (const ip of aaaa) out.push({ ip, version: "v6" });
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

const RECOMMENDATIONS = [
  "Lock the origin firewall to accept 80/443 only from the CDN's published IP ranges (https://www.cloudflare.com/ips/).",
  "Enable Authenticated Origin Pulls (mTLS) so the origin only trusts the CDN.",
  "If the origin IP was ever served directly, rotate it - past exposure persists in historical DNS and CT.",
  "Ensure every subdomain is proxied through the CDN, or points to an isolated host unrelated to the origin.",
  "Send email through a dedicated provider (SES/SendGrid) so mail headers do not leak the origin IP.",
  "Use a CDN Origin CA certificate for the origin so its hostnames are not published to public CT logs.",
];

// Map a network-owner string to a well-known provider label.
const PROVIDER_MAP: [RegExp, string][] = [
  [/amazon|aws|amzn/i, "AWS"],
  [/microsoft|azure/i, "Azure"],
  [/google|goog\b|gcp/i, "Google Cloud"],
  [/hetzner/i, "Hetzner"],
  [/\bovh\b/i, "OVH"],
  [/digitalocean/i, "DigitalOcean"],
  [/cloudflare/i, "Cloudflare"],
  [/akamai/i, "Akamai"],
  [/fastly/i, "Fastly"],
  [/linode/i, "Linode"],
  [/vultr|choopa/i, "Vultr"],
  [/leaseweb/i, "LeaseWeb"],
  [/oracle/i, "Oracle Cloud"],
  [/gcore|g-core/i, "Gcore"],
];

function classifyProvider(owner: string): string | undefined {
  for (const [re, label] of PROVIDER_MAP) if (re.test(owner)) return label;
  return undefined;
}

/** Public RDAP lookup for an IP's network owner (keyless, cached 7 days). */
async function providerForIp(ip: string): Promise<{ provider?: string; org?: string } | null> {
  const ck = `rdap:${ip}`;
  const hit = await cacheGet<{ provider?: string; org?: string }>(ck, 7 * TTL);
  if (hit) return hit;
  const data = await getJson<any>(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
    timeoutMs: 10000, headers: { Accept: "application/rdap+json" },
  });
  if (!data) return null;
  const names: string[] = [];
  if (data.name) names.push(String(data.name));
  for (const e of Array.isArray(data.entities) ? data.entities : []) {
    const card = e?.vcardArray?.[1];
    if (Array.isArray(card)) {
      for (const row of card) if (Array.isArray(row) && row[0] === "fn" && row[3]) names.push(String(row[3]));
    }
    if (e?.handle) names.push(String(e.handle));
  }
  const org = names.find(Boolean);
  const out = { org, provider: classifyProvider(names.join(" ")) };
  await cacheSet(ck, out);
  return out;
}

/** Historical A records via SecurityTrails (env-gated; passive OSINT). */
async function securityTrailsHistory(domain: string, cfRanges: Cidr[]): Promise<HistoricalDns> {
  const key = process.env.SECURITYTRAILS_API_KEY?.trim();
  if (!key) {
    return { available: false, candidates: [], note: "Set SECURITYTRAILS_API_KEY to include historical DNS origin candidates." };
  }
  const data = await getJson<any>(`https://api.securitytrails.com/v1/history/${encodeURIComponent(domain)}/dns/a`, {
    timeoutMs: 15000, headers: { apikey: key, Accept: "application/json" },
  });
  const records = Array.isArray(data?.records) ? data.records : null;
  if (!records) return { available: false, candidates: [], note: "SecurityTrails history unavailable (check the key/plan)." };
  const seen = new Map<string, { ip: string; firstSeen?: string; lastSeen?: string }>();
  for (const rec of records) {
    for (const v of Array.isArray(rec?.values) ? rec.values : []) {
      const ip = String(v?.ip || "");
      if (!ip || isInRanges(ip, cfRanges)) continue; // skip CDN IPs - only real origins
      const cur = seen.get(ip) || { ip, firstSeen: rec.first_seen, lastSeen: rec.last_seen };
      if (rec.last_seen) cur.lastSeen = rec.last_seen;
      seen.set(ip, cur);
    }
  }
  return {
    available: true,
    candidates: [...seen.values()].slice(0, 50),
    note: "Historically-observed A records outside the CDN ranges. If any is still live, rotate it - past exposure persists in public history.",
  };
}

export interface AuditOptions {
  /** Extra subdomain labels to probe (custom wordlist). */
  customSubs?: string[];
}

/** Run a passive origin-exposure audit. Cached per day for reproducibility. */
export async function auditOriginExposure(domainInput: string, opts: AuditOptions = {}): Promise<OriginExposureReport> {
  const now = () => new Date().toISOString();
  const domain = (domainInput || "")
    .trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return baseReport(domain, now(), "insufficient_data", false, {
      note: "Enter a valid registrable domain (e.g. example.com).",
    });
  }

  const ck = `origin-exposure:${domain}`;
  const cached = await cacheGet<OriginExposureReport>(ck, TTL);
  if (cached) return cached;

  const cfRanges = await loadCloudflareRanges();
  const resolver = makeResolver();

  // Candidate names: apex + www + common subs + CT-log names, capped.
  const ct = await crtshNames(domain).catch(() => []);
  const candidateNames = new Set<string>([domain, `www.${domain}`]);
  for (const s of DEFAULT_SUBS) candidateNames.add(`${s}.${domain}`);
  for (const s of opts.customSubs || []) {
    const label = String(s).trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
    if (label) candidateNames.add(`${label}.${domain}`);
  }
  for (const nm of ct) candidateNames.add(nm);
  const names = [...candidateNames].slice(0, MAX_NAMES);

  const resolved = await mapLimit(names, CONCURRENCY, async (name) => ({
    name,
    ips: await resolveBoth(resolver, name),
  }));

  const exposed: OriginExposureRecord[] = [];
  let proxiedCount = 0;
  let anyResolved = false;
  let apexOrWwwInCdn = false;

  for (const { name, ips } of resolved) {
    for (const { ip, version } of ips) {
      anyResolved = true;
      const inCdn = isInRanges(ip, cfRanges);
      if (inCdn) {
        proxiedCount++;
        if (name === domain || name === `www.${domain}`) apexOrWwwInCdn = true;
      } else {
        exposed.push({ name, ip, version });
      }
    }
  }

  const uniqueExposedIps = [...new Set(exposed.map((e) => e.ip))];
  const cdnFronted = apexOrWwwInCdn;

  let band: OriginExposureBand;
  let confidence: OriginExposureReport["confidence"];
  const evidence: string[] = [];

  if (!anyResolved) {
    band = "insufficient_data";
    confidence = "Low";
    evidence.push("No A/AAAA records resolved for the apex or common subdomains.");
  } else if (!cdnFronted) {
    band = "not_cdn_fronted";
    confidence = "Medium";
    evidence.push("The apex/www does not resolve into Cloudflare ranges, so the site is not CDN-fronted here; the serving IP is public by design.");
  } else if (exposed.length > 0) {
    band = "possible_exposure";
    confidence = uniqueExposedIps.length >= 2 ? "Medium" : "Low";
    evidence.push(`${exposed.length} record(s) across ${uniqueExposedIps.length} non-Cloudflare IP(s) while the apex/www is Cloudflare-fronted.`);
    evidence.push(`Names: ${exposed.slice(0, 8).map((e) => e.name).join(", ")}${exposed.length > 8 ? " ..." : ""}`);
  } else {
    band = "no_exposure_observed";
    confidence = "Medium";
    evidence.push(`${proxiedCount} record(s) across the checked names all resolve inside Cloudflare ranges.`);
  }

  // Enrich unique exposed IPs with public RDAP provider/ASN owner (bounded).
  const providerByIp = new Map<string, { provider?: string; org?: string }>();
  await mapLimit(uniqueExposedIps.slice(0, 25), 5, async (ip) => {
    const p = await providerForIp(ip).catch(() => null);
    if (p) providerByIp.set(ip, p);
  });
  for (const rec of exposed) {
    const p = providerByIp.get(rec.ip);
    if (p) { rec.provider = p.provider; rec.org = p.org; }
  }

  // Historical DNS origin candidates (env-gated; passive).
  const historical = await securityTrailsHistory(domain, cfRanges).catch(
    () => ({ available: false, candidates: [], note: "Historical DNS lookup failed." }),
  );

  // De-duplicated candidate origins (current + CT + historical), enriched.
  const candMap = new Map<string, OriginCandidate>();
  for (const rec of exposed) {
    const src = rec.name === domain || rec.name === `www.${domain}` ? "current DNS" : `subdomain ${rec.name}`;
    const c = candMap.get(rec.ip) || { ip: rec.ip, version: rec.version, provider: rec.provider, org: rec.org, sources: [] };
    if (!c.sources.includes(src)) c.sources.push(src);
    candMap.set(rec.ip, c);
  }
  for (const h of historical.candidates) {
    const p = providerByIp.get(h.ip) || (await providerForIp(h.ip).catch(() => null)) || {};
    const c = candMap.get(h.ip) || { ip: h.ip, version: h.ip.includes(":") ? "v6" : "v4", provider: p.provider, org: p.org, sources: [] };
    if (!c.sources.includes("historical DNS")) c.sources.push("historical DNS");
    candMap.set(h.ip, c);
  }
  const candidates = [...candMap.values()].slice(0, 100);

  // Dominant provider label among candidates.
  const provCounts = new Map<string, number>();
  for (const c of candidates) if (c.provider) provCounts.set(c.provider, (provCounts.get(c.provider) || 0) + 1);
  const provider = [...provCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Confidence in the EXPOSURE ASSESSMENT (not that a bypass works).
  const confidenceScore =
    band === "no_exposure_observed" ? 90 :
    band === "not_cdn_fronted" ? 75 :
    band === "possible_exposure" ? Math.min(70, 30 + candidates.length * 12) :
    20;

  const report: OriginExposureReport = {
    available: true,
    domain,
    cdnFronted,
    cdn: cdnFronted ? "Cloudflare" : "none detected",
    namesChecked: names.length,
    exposed: exposed.slice(0, 100),
    proxiedCount,
    uniqueExposedIps,
    candidates,
    provider,
    originFound: false,
    historical,
    band,
    confidence,
    confidenceScore,
    evidence,
    alternative:
      "A non-Cloudflare IP is not proof of the live origin: it is often a third-party mail, analytics, or SaaS host, a parked or legacy record, or a subdomain intentionally served outside the CDN. Confirm ownership before acting.",
    recommendations: band === "possible_exposure" ? RECOMMENDATIONS : RECOMMENDATIONS.slice(0, 3),
    note: "Passive audit of PUBLIC records (Certificate Transparency + DNS + RDAP) for a domain you are authorized to inspect. Indicators for hardening, not a verdict; this tool never probes or connects to the origin, so candidates are for the owner to verify, not confirmed origins.",
    collectedAt: now(),
  };

  await cacheSet(ck, report);
  return report;
}

function baseReport(
  domain: string,
  collectedAt: string,
  band: OriginExposureBand,
  cdnFronted: boolean,
  extra: Partial<OriginExposureReport>,
): OriginExposureReport {
  return {
    available: true,
    domain,
    cdnFronted,
    cdn: "none detected",
    namesChecked: 0,
    exposed: [],
    proxiedCount: 0,
    uniqueExposedIps: [],
    candidates: [],
    provider: null,
    originFound: false,
    historical: { available: false, candidates: [], note: "" },
    band,
    confidence: "Low",
    confidenceScore: 0,
    evidence: [],
    alternative: "",
    recommendations: [],
    note: "",
    collectedAt,
    ...extra,
  };
}
