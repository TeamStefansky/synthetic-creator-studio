// Best-effort origin discovery behind a CDN (e.g. Cloudflare), using ONLY
// public DNS data — legitimate OSINT. When a site is fronted by a CDN the real
// server IP is hidden, but it often leaks through:
//   - subdomains that aren't proxied (mail, ftp, cpanel, direct, origin, …)
//   - MX (mail) servers, which are rarely behind the CDN
//   - SPF records that list the operator's own IPs
// Any resolved IP that is NOT in a CDN's ASN is a candidate true origin.
// Results are probabilistic — candidates, not proof.

import { resolveHostIp, type DnsRecords } from "./dns";
import { enrichIp, detectCdn } from "./ip";
import type { OriginTrace, OriginCandidate, HostingInfo } from "./types";

// Subdomains that are commonly served directly (not proxied through the CDN).
const PROBE_SUBDOMAINS = [
  "mail", "webmail", "webmail2", "ftp", "cpanel", "whm", "webdisk", "smtp",
  "smtp2", "mx", "mx1", "mx2", "relay", "mailgw", "mailhost", "exchange", "owa",
  "pop", "pop3", "imap", "autodiscover", "autoconfig",
  "direct", "direct-connect", "origin", "origin-www", "server", "host", "cpsess",
  "ns1", "ns2", "dns", "dev", "staging", "test", "beta", "old", "www2", "web",
  "vpn", "remote", "portal", "admin", "panel", "secure", "gateway",
  "api", "app", "blog", "shop", "store", "forum", "cloud", "git", "backup",
];

const PRIVATE_IP_RE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const isPublic = (ip: string) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !PRIVATE_IP_RE.test(ip);

function spfIps(txt: string[]): string[] {
  const out: string[] = [];
  for (const t of txt) {
    if (!/v=spf1/i.test(t)) continue;
    for (const m of t.matchAll(/ip4:(\d+\.\d+\.\d+\.\d+)/gi)) out.push(m[1]);
  }
  return out;
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function traceOrigin(
  domain: string,
  dns: DnsRecords,
  hosting: HostingInfo | undefined,
): Promise<OriginTrace> {
  const cdn = hosting?.cdn;
  const edgeIp = hosting?.ip;
  const methods: string[] = [];

  // 1) Probe non-proxied subdomains.
  const hosts = PROBE_SUBDOMAINS.map((s) => `${s}.${domain}`);
  methods.push(`Probed ${hosts.length} common non-proxied subdomains`);
  const subResults = await pool(hosts, 6, async (h): Promise<{ h: string; ip?: string }> => ({
    h,
    ip: await resolveHostIp(h).catch(() => undefined),
  }));

  // 2) MX hosts.
  const mxHostList = dns.mx.map((r) => (r.split(/\s+/).pop() || r).replace(/\.$/, "").toLowerCase());
  if (mxHostList.length) methods.push("Resolved MX (mail) servers");
  const mxResults = await pool(mxHostList.slice(0, 4), 4, async (h): Promise<{ h: string; ip?: string }> => ({
    h: `MX ${h}`,
    ip: await resolveHostIp(h).catch(() => undefined),
  }));

  // 3) SPF ip4 entries.
  const spf = spfIps(dns.txt);
  if (spf.length) methods.push("Parsed SPF record IPs");

  // Collect unique candidate IPs with their source, excluding the CDN edge IP.
  const found = new Map<string, string>(); // ip -> source
  const note = (ip?: string, source?: string) => {
    if (!ip || !isPublic(ip) || ip === edgeIp) return;
    if (!found.has(ip)) found.set(ip, source || "dns");
  };
  for (const r of subResults) note(r.ip, `subdomain ${r.h}`);
  for (const r of mxResults) note(r.ip, r.h);
  for (const ip of spf) note(ip, "SPF record");

  // Enrich + classify candidates; non-CDN IPs are possible true origins.
  const enriched = await pool(Array.from(found.entries()), 5, async ([ip, source]: [string, string]): Promise<OriginCandidate> => {
    const e = await enrichIp(ip);
    const isCdn = !!detectCdn(e.asnOrg);
    const c: OriginCandidate = {
      ip,
      country: e.country,
      asnOrg: e.asnOrg,
      source,
      isCdn,
      isAdversary: e.isAdversary,
    };
    return c;
  });

  const candidates = enriched.filter((c) => !c.isCdn);
  const likely = candidates[0];

  let summary: string;
  if (!cdn) {
    summary =
      candidates.length > 0
        ? `No CDN fronting detected. Found ${candidates.length} additional infrastructure IP(s) via DNS.`
        : "No CDN detected — the server IP in the report is already the real origin.";
  } else if (candidates.length > 0) {
    summary = `${cdn} fronts the site, but ${candidates.length} non-CDN IP(s) leaked via DNS — likely the true origin or operator infrastructure.`;
  } else {
    summary = `${cdn} fronts the site and no origin IP leaked via these public-DNS techniques. The true origin remains hidden (would require historical-DNS data, which needs a paid source).`;
  }

  return {
    available: true,
    cdn,
    edgeIp,
    edgeCountry: hosting?.country,
    candidates,
    likelyOrigin: likely ? { ip: likely.ip, country: likely.country, asnOrg: likely.asnOrg } : undefined,
    methods,
    note: summary,
  };
}
