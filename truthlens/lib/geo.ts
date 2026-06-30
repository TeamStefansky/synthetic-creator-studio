// Assemble the geographic picture of a site: server, registrant, mail (MX) and
// DNS (NS) server countries. MX/NS hostnames are resolved to IPs and geo-located
// (cached, capped to respect rate limits).

import { enrichIp } from "./ip";
import { resolveHostIp } from "./dns";
import type { Geography, GeoEndpoint, HostingInfo } from "./types";

async function endpointFor(host: string): Promise<GeoEndpoint> {
  const clean = host.replace(/\.$/, "").toLowerCase();
  try {
    const ip = await resolveHostIp(clean);
    if (!ip) return { host: clean };
    const e = await enrichIp(ip);
    return { host: clean, ip, country: e.country, asnOrg: e.asnOrg, isAdversary: e.isAdversary };
  } catch {
    return { host: clean };
  }
}

async function resolveAll(hosts: string[], cap: number): Promise<GeoEndpoint[]> {
  const unique = Array.from(new Set(hosts.map((h) => h.replace(/\.$/, "").toLowerCase()))).slice(0, cap);
  const out: GeoEndpoint[] = [];
  for (const h of unique) out.push(await endpointFor(h)); // sequential = gentle on rate limits
  return out;
}

export async function buildGeography(
  hosting: HostingInfo | undefined,
  registrantCountry: string | undefined,
  mxHostsList: string[],
  nsHostsList: string[],
): Promise<Geography> {
  const mail = await resolveAll(mxHostsList, 3);
  const dns = await resolveAll(nsHostsList, 3);

  const server =
    hosting?.ip
      ? {
          host: hosting.ip,
          ip: hosting.ip,
          country: hosting.cdnMasksOrigin ? undefined : hosting.country,
          asnOrg: hosting.asnOrg,
          city: hosting.city,
          region: hosting.region,
          cdn: hosting.cdn,
          masked: hosting.cdnMasksOrigin,
        }
      : undefined;

  const countries = new Set<string>();
  if (server?.country) countries.add(server.country.toUpperCase());
  if (registrantCountry) countries.add(registrantCountry.toUpperCase());
  for (const m of mail) if (m.country) countries.add(m.country.toUpperCase());
  for (const d of dns) if (d.country) countries.add(d.country.toUpperCase());

  return {
    server,
    registrantCountry,
    mail,
    dns,
    countries: Array.from(countries),
  };
}
