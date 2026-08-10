// OSINT deep-collection helpers - all KEYLESS, official endpoints. These fill
// the infrastructure/actor/sources depth the automated report was missing:
//   - resolveDomainInfra: domain → IP → ASN/org/country (DNS + IP enrichment)
//   - lookupDomainRdap: registrar + registration date + registrant org (RDAP)
//   - gdeltArticles: recent news coverage of the query (GDELT DOC 2.0 artlist)
// Each degrades to null/[] on error (failure isolation) - never fabricates.

import { Resolver } from "dns/promises";
import { getJson } from "@/lib/http";
import { enrichIp } from "@/lib/ip";

export interface DomainInfra {
  ip?: string;
  asn?: string;
  org?: string; // network operator / hosting org
  country?: string;
}

export interface DomainRdap {
  registrar?: string;
  registrationDate?: string; // ISO date
  registrantOrg?: string; // organization only (never a person, rule 1)
}

export interface NewsArticle {
  title: string;
  url: string;
  domain: string;
  date?: string;
  language?: string;
}

/** Resolve a domain to its first IP and enrich to ASN/org/country. Keyless. */
export async function resolveDomainInfra(domain: string): Promise<DomainInfra> {
  try {
    const r = new Resolver({ timeout: 3000, tries: 1 });
    r.setServers(["1.1.1.1", "8.8.8.8"]);
    const ips = await r.resolve4(domain).catch(() => [] as string[]);
    const ip = ips[0];
    if (!ip) return {};
    const e = await enrichIp(ip);
    return { ip, asn: e.asn ? (String(e.asn).startsWith("AS") ? String(e.asn) : `AS${e.asn}`) : undefined, org: e.asnOrg, country: e.country };
  } catch {
    return {};
  }
}

/** Registrar / registration date / registrant ORGANIZATION via public RDAP. */
export async function lookupDomainRdap(domain: string): Promise<DomainRdap> {
  try {
    const j = await getJson<any>(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      timeoutMs: 7000, headers: { Accept: "application/rdap+json" },
    });
    if (!j) return {};
    const events: any[] = Array.isArray(j.events) ? j.events : [];
    const reg = events.find((e) => /registration/i.test(e?.eventAction || ""));
    const entities: any[] = Array.isArray(j.entities) ? j.entities : [];
    const roleEntity = (role: string) => entities.find((e) => Array.isArray(e?.roles) && e.roles.includes(role));
    const vcardValue = (entity: any, key: string): string | undefined => {
      const arr = entity?.vcardArray?.[1];
      if (!Array.isArray(arr)) return undefined;
      const row = arr.find((x: any) => Array.isArray(x) && x[0] === key);
      return row ? String(row[3] || "") : undefined;
    };
    // registrant ORG only - an "fn" that is a person is left out (rule 1); we take
    // the org field ("org") which is organizational by definition.
    const registrantEntity = roleEntity("registrant");
    const registrarEntity = roleEntity("registrar");
    return {
      registrar: registrarEntity ? (vcardValue(registrarEntity, "fn") || undefined) : undefined,
      registrationDate: reg?.eventDate ? String(reg.eventDate).slice(0, 10) : undefined,
      registrantOrg: registrantEntity ? (vcardValue(registrantEntity, "org") || undefined) : undefined,
    };
  } catch {
    return {};
  }
}

/** Recent news coverage of a query via GDELT DOC 2.0 (keyless). A LEAD list of
 * primary sources for the report, deduped by URL, capped. */
export async function gdeltArticles(query: string, max = 12): Promise<NewsArticle[]> {
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`"${query}"`)}&mode=artlist&maxrecords=${max}&format=json&sort=datedesc`;
    const j = await getJson<any>(url, { timeoutMs: 12000, headers: { "User-Agent": "TruthLens/0.1 (OSINT research)" } });
    const arts: any[] = Array.isArray(j?.articles) ? j.articles : [];
    const seen = new Set<string>();
    const out: NewsArticle[] = [];
    for (const a of arts) {
      const u = String(a?.url || "");
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push({
        title: String(a?.title || "").slice(0, 200),
        url: u,
        domain: String(a?.domain || "").toLowerCase(),
        date: a?.seendate ? String(a.seendate).slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") : undefined,
        language: a?.language ? String(a.language) : undefined,
      });
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}
