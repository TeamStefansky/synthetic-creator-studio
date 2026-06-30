// IP / ASN / geo enrichment with CDN detection and datacenter classification.
// Primary source: ipinfo.io (token optional). Fallback: ip-api.com (free).
// Results are cached per-IP to respect rate limits.

import { getJson } from "./http";
import { cacheGet, cacheSet } from "./cache";
import { isAdversaryCountry } from "./adversary";
import type { HostingInfo, IpEnrichment } from "./types";

// ASN orgs / names that indicate a CDN edge (true origin masked).
const CDN_SIGNATURES: { name: string; re: RegExp }[] = [
  { name: "Cloudflare", re: /cloudflare/i },
  { name: "Akamai", re: /akamai/i },
  { name: "Fastly", re: /fastly/i },
  { name: "Amazon CloudFront", re: /cloudfront|amazon/i },
  { name: "Google Cloud CDN", re: /google/i },
  { name: "Microsoft Azure CDN", re: /microsoft|azure/i },
  { name: "Sucuri", re: /sucuri/i },
  { name: "Incapsula / Imperva", re: /incapsula|imperva/i },
];

// Hosting/datacenter ASN org hints (strong bot signal in logs).
const DATACENTER_HINTS =
  /amazon|aws|google|microsoft|azure|digitalocean|linode|ovh|hetzner|vultr|leaseweb|contabo|hostinger|godaddy|namecheap|cloudflare|oracle|alibaba|tencent|scaleway|choopa|m247|datacamp|data ?center|hosting|server|colo|vps|cloud/i;

interface IpInfoResp {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string; // "AS13335 Cloudflare, Inc."
  hostname?: string;
}
interface IpApiResp {
  status?: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string; // "AS13335 Cloudflare, Inc."
  reverse?: string;
  hosting?: boolean;
  proxy?: boolean;
}

function classifyHosting(asnOrg?: string): "residential" | "datacenter" | "unknown" {
  if (!asnOrg) return "unknown";
  return DATACENTER_HINTS.test(asnOrg) ? "datacenter" : "residential";
}

function detectCdn(asnOrg?: string): string | undefined {
  if (!asnOrg) return undefined;
  return CDN_SIGNATURES.find((c) => c.re.test(asnOrg))?.name;
}

function splitOrg(org?: string): { asn?: string; asnOrg?: string } {
  if (!org) return {};
  const m = org.match(/^(AS\d+)\s+(.*)$/i);
  if (m) return { asn: m[1].toUpperCase(), asnOrg: m[2] };
  return { asnOrg: org };
}

/** Low-level enrichment used by both the site report and the attribution tools. */
export async function enrichIp(ip: string): Promise<IpEnrichment> {
  const cached = await cacheGet<IpEnrichment>(`ip:${ip}`);
  if (cached) return cached;

  const token = process.env.IPINFO_TOKEN;
  let country: string | undefined;
  let region: string | undefined;
  let city: string | undefined;
  let asn: string | undefined;
  let asnOrg: string | undefined;
  let ptr: string | undefined;

  if (token) {
    const r = await getJson<IpInfoResp>(
      `https://ipinfo.io/${ip}/json?token=${token}`,
    );
    if (r) {
      country = r.country;
      region = r.region;
      city = r.city;
      ptr = r.hostname;
      const s = splitOrg(r.org);
      asn = s.asn;
      asnOrg = s.asnOrg;
    }
  }

  // Fallback (or primary when no token).
  if (!country) {
    const r = await getJson<IpApiResp>(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp,org,as,reverse,hosting,proxy`,
    );
    if (r && r.status === "success") {
      country = r.countryCode;
      region = r.regionName;
      city = r.city;
      ptr = r.reverse;
      const s = splitOrg(r.as);
      asn = s.asn;
      asnOrg = s.asnOrg || r.isp || r.org;
    }
  }

  const enrichment: IpEnrichment = {
    ip,
    country,
    region,
    city,
    asn,
    asnOrg,
    ptr,
    hostingType: classifyHosting(asnOrg),
    isAdversary: isAdversaryCountry(country),
  };

  await cacheSet(`ip:${ip}`, enrichment);
  return enrichment;
}

/** Site-report hosting view: enrichment + CDN masking caveat. */
export async function lookupHosting(ip?: string): Promise<HostingInfo> {
  if (!ip) return { mxProviders: [] } as unknown as HostingInfo;
  const e = await enrichIp(ip);
  const cdn = detectCdn(e.asnOrg);
  return {
    ip: e.ip,
    asn: e.asn,
    asnOrg: e.asnOrg,
    country: e.country,
    region: e.region,
    city: e.city,
    hostingType: e.hostingType,
    cdn,
    cdnMasksOrigin: !!cdn,
  };
}

export { detectCdn };
