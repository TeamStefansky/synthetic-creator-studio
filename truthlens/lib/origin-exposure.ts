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
  band: OriginExposureBand;
  confidence: "Low" | "Medium" | "High";
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

/** Run a passive origin-exposure audit. Cached per day for reproducibility. */
export async function auditOriginExposure(domainInput: string): Promise<OriginExposureReport> {
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
  const candidates = new Set<string>([domain, `www.${domain}`]);
  for (const s of DEFAULT_SUBS) candidates.add(`${s}.${domain}`);
  for (const nm of ct) candidates.add(nm);
  const names = [...candidates].slice(0, MAX_NAMES);

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

  const report: OriginExposureReport = {
    available: true,
    domain,
    cdnFronted,
    cdn: cdnFronted ? "Cloudflare" : "none detected",
    namesChecked: names.length,
    exposed: exposed.slice(0, 100),
    proxiedCount,
    uniqueExposedIps,
    band,
    confidence,
    evidence,
    alternative:
      "A non-Cloudflare IP is not proof of the live origin: it is often a third-party mail, analytics, or SaaS host, a parked or legacy record, or a subdomain intentionally served outside the CDN. Confirm ownership before acting.",
    recommendations: band === "possible_exposure" ? RECOMMENDATIONS : RECOMMENDATIONS.slice(0, 3),
    note: "Passive audit of PUBLIC records (Certificate Transparency + DNS) for a domain you are authorized to inspect. Indicators for hardening, not a verdict; this tool never probes or connects to the origin.",
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
    band,
    confidence: "Low",
    evidence: [],
    alternative: "",
    recommendations: [],
    note: "",
    collectedAt,
    ...extra,
  };
}
