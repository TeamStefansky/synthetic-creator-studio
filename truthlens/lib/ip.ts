// IP / ASN / geolocation via ipinfo.io. Token is optional but raises limits.

import { getJson } from "./httpClient";
import type { HostingInfo } from "./types";

interface IpInfoResponse {
  ip?: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string; // e.g. "AS13335 Cloudflare, Inc."
  asn?: { asn?: string; name?: string };
}

/** Split "AS13335 Cloudflare, Inc." into { asn, org }. */
function splitOrg(org?: string): { asn: string | null; name: string | null } {
  if (!org) return { asn: null, name: null };
  const m = org.match(/^(AS\d+)\s+(.*)$/i);
  if (m) return { asn: m[1].toUpperCase(), name: m[2].trim() };
  return { asn: null, name: org };
}

export async function lookupIp(ip: string): Promise<HostingInfo | null> {
  const token = process.env.IPINFO_TOKEN;
  const url =
    `https://ipinfo.io/${ip}/json` + (token ? `?token=${token}` : "");
  const json = await getJson<IpInfoResponse>(url);
  if (!json) return null;

  const fromOrg = splitOrg(json.org);
  const asn = json.asn?.asn ?? fromOrg.asn;
  const org = json.asn?.name ?? fromOrg.name;

  return {
    ip: json.ip ?? ip,
    asn: asn ?? null,
    org: org ?? null,
    city: json.city ?? null,
    region: json.region ?? null,
    country: json.country ?? null,
    hostname: json.hostname ?? null,
  };
}
