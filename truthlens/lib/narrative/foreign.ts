// Foreign-influence enrichment (v2). Reuses the shared OSINT libs (rdap / dns / ip)
// on the amplifying DOMAINS behind a narrative to surface INFRASTRUCTURE
// correlations — registrant/hosting-country concentration and shared networks.
//
// HARD RULES: infrastructure facts only (domains, ASNs, countries, orgs) — never a
// private individual. Every downstream signal renders "correlation, not proof of
// state involvement". Network calls are cached per-day and capped (reproducibility
// + politeness). Missing intel degrades to a smaller `resolved` count, never faked.

import { lookupRdap } from "@/lib/rdap";
import { resolveHostIp } from "@/lib/dns";
import { enrichIp } from "@/lib/ip";
import { cacheGet, cacheSet } from "@/lib/cache";
import { mentionDomains } from "@/lib/io-reference";
import type { Mention, DomainIntel, ForeignEnrichment } from "./types";

const ENRICH_CAP = 12;                    // max amplifying domains enriched per scan
const INTEL_TTL = 24 * 60 * 60 * 1000;    // per-day cache → reproducible report

type DomainFacts = Omit<DomainIntel, "domain" | "count">;

async function domainFacts(domain: string): Promise<DomainFacts> {
  const ck = `fintel:${domain}`;
  const hit = await cacheGet<DomainFacts>(ck, INTEL_TTL);
  if (hit) return hit;

  const rdap = await lookupRdap(domain).catch(() => null);
  let hostingCountry: string | undefined, asn: string | undefined, asnOrg: string | undefined;
  const ip = await resolveHostIp(domain).catch(() => undefined);
  if (ip) {
    const e = await enrichIp(ip).catch(() => null);
    if (e) { hostingCountry = e.country; asn = e.asn; asnOrg = e.asnOrg; }
  }
  const facts: DomainFacts = {
    registrantCountry: rdap?.registrantCountry,
    registrantOrg: rdap?.registrantOrg,
    hostingCountry, asn, asnOrg,
    ageDays: rdap?.ageDays,
    privacyProtected: rdap?.privacyProtected,
  };
  await cacheSet(ck, facts);
  return facts;
}

/** Enrich the top amplifying domains (by mention count). Network + cached + capped. */
export async function enrichAmplifyingDomains(mentions: Mention[], cap = ENRICH_CAP): Promise<DomainIntel[]> {
  const counts = new Map<string, number>();
  for (const m of mentions) for (const d of mentionDomains(m)) counts.set(d, (counts.get(d) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap);
  return Promise.all(top.map(async ([domain, count]): Promise<DomainIntel> => ({
    domain, count, ...(await domainFacts(domain)),
  })));
}

function topShare(values: (string | undefined)[]): { top?: string; share: number } {
  const counts = new Map<string, number>();
  let n = 0;
  for (const v of values) if (v) { counts.set(v, (counts.get(v) || 0) + 1); n++; }
  if (!n) return { share: 0 };
  let top: string | undefined, best = 0;
  for (const [k, c] of counts) if (c > best) { best = c; top = k; }
  return { top, share: best / n };
}

/** Pure aggregation over already-collected intel (no network) — testable. */
export function summarizeForeign(intel: DomainIntel[]): ForeignEnrichment {
  const resolvedList = intel.filter((d) => d.registrantCountry || d.hostingCountry || d.asn);
  const reg = topShare(intel.map((d) => d.registrantCountry));
  const host = topShare(intel.map((d) => d.hostingCountry));

  const asnMap = new Map<string, { asnOrg?: string; domains: Set<string> }>();
  for (const d of intel) {
    if (!d.asn) continue;
    const g = asnMap.get(d.asn) || { asnOrg: d.asnOrg, domains: new Set<string>() };
    g.domains.add(d.domain);
    asnMap.set(d.asn, g);
  }
  const sharedAsn = [...asnMap.entries()]
    .filter(([, g]) => g.domains.size >= 2)
    .sort((a, b) => b[1].domains.size - a[1].domains.size)
    .map(([asn, g]) => ({ asn, asnOrg: g.asnOrg, domains: [...g.domains] }));

  return {
    intel,
    considered: intel.length,
    resolved: resolvedList.length,
    topRegistrantCountry: reg.top,
    registrantShare: reg.share,
    topHostingCountry: host.top,
    hostingShare: host.share,
    sharedAsn,
    privacyCount: intel.filter((d) => d.privacyProtected).length,
  };
}

/** One call: enrich + summarize. Returns undefined when there are no domains. */
export async function foreignEnrichment(mentions: Mention[]): Promise<ForeignEnrichment | undefined> {
  const intel = await enrichAmplifyingDomains(mentions);
  if (!intel.length) return undefined;
  return summarizeForeign(intel);
}
