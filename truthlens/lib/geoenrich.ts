// Shared IP enrichment for the attribution tools (log analyzer + email tracer).
// Primary source ipinfo.io, fallback ip-api.com. Results are cached in-process
// and enrichment is batched with a small concurrency cap to respect free-tier
// rate limits. Every field degrades gracefully to null / enriched:false so a
// blocked or throttled upstream never breaks the analysis.

import { getJson } from "./httpClient";
import { detectCdn, isDatacenterOrg, isAdversaryCountry } from "./adversary";
import type { EnrichedIp } from "./types";

// Private / reserved ranges we never send to a geo API.
export function isPrivateIp(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true; // not IPv4 -> skip
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0 ||
    a >= 224 // multicast / reserved
  );
}

const cache = new Map<string, EnrichedIp>();

function unenriched(ip: string): EnrichedIp {
  return {
    ip,
    country: null,
    city: null,
    asn: null,
    asnOrg: null,
    isDatacenter: false,
    isCdn: false,
    cdnProvider: null,
    ptr: null,
    adversary: false,
    enriched: false,
  };
}

interface IpInfoResp {
  city?: string;
  country?: string;
  org?: string;
  hostname?: string;
  asn?: { asn?: string; name?: string };
}
interface IpApiResp {
  status?: string;
  countryCode?: string;
  city?: string;
  as?: string; // "AS15169 Google LLC"
  asname?: string;
  reverse?: string;
}

function finalize(
  ip: string,
  country: string | null,
  city: string | null,
  asn: string | null,
  asnOrg: string | null,
  ptr: string | null
): EnrichedIp {
  const cdn = detectCdn(asnOrg);
  const info: EnrichedIp = {
    ip,
    country,
    city,
    asn,
    asnOrg,
    isDatacenter: cdn.isCdn || isDatacenterOrg(asnOrg),
    isCdn: cdn.isCdn,
    cdnProvider: cdn.provider,
    ptr,
    adversary: isAdversaryCountry(country),
    enriched: true,
  };
  return info;
}

async function enrichOne(ip: string): Promise<EnrichedIp> {
  const cached = cache.get(ip);
  if (cached) return cached;
  if (isPrivateIp(ip)) {
    const u = unenriched(ip);
    cache.set(ip, u);
    return u;
  }

  // Primary: ipinfo.io (token optional).
  const token = process.env.IPINFO_TOKEN;
  const info = await getJson<IpInfoResp>(
    `https://ipinfo.io/${ip}/json` + (token ? `?token=${token}` : "")
  );
  if (info && (info.country || info.org || info.asn)) {
    const m = (info.org ?? "").match(/^(AS\d+)\s+(.*)$/i);
    const result = finalize(
      ip,
      info.country ?? null,
      info.city ?? null,
      info.asn?.asn ?? (m ? m[1].toUpperCase() : null),
      info.asn?.name ?? (m ? m[2] : info.org ?? null),
      info.hostname ?? null
    );
    cache.set(ip, result);
    return result;
  }

  // Fallback: ip-api.com (no key, rate-limited to ~45 req/min).
  const alt = await getJson<IpApiResp>(
    `http://ip-api.com/json/${ip}?fields=status,countryCode,city,as,asname,reverse`
  );
  if (alt && alt.status === "success") {
    const m = (alt.as ?? "").match(/^(AS\d+)\s+(.*)$/i);
    const result = finalize(
      ip,
      alt.countryCode ?? null,
      alt.city ?? null,
      m ? m[1].toUpperCase() : null,
      alt.asname ?? (m ? m[2] : null),
      alt.reverse || null
    );
    cache.set(ip, result);
    return result;
  }

  const u = unenriched(ip);
  cache.set(ip, u);
  return u;
}

/** Enrich many IPs with a small concurrency cap (respects free-tier limits). */
export async function enrichIps(
  ips: string[],
  concurrency = 6
): Promise<Map<string, EnrichedIp>> {
  const out = new Map<string, EnrichedIp>();
  const queue = [...new Set(ips)];
  async function worker() {
    while (queue.length) {
      const ip = queue.shift();
      if (!ip) break;
      out.set(ip, await enrichOne(ip));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker)
  );
  return out;
}

export async function enrichIp(ip: string): Promise<EnrichedIp> {
  return enrichOne(ip);
}
