// Site Report -> EvidenceItem drafts (layer 03 · P1). Reads the evidence-bearing
// slice of a Report defensively (fields vary / may be unavailable). Time tiers:
// RDAP createdAt + SSL validFrom = T1, wayback firstSeen = T2, live infra = no
// event time (a current fact, not a dated event). Reuses the clue net_org
// normalizer (one source of truth).

import { normalizeNetOrg, regDomain } from "@/lib/clues/extract";
import type { EvidenceDraft } from "../types";
import { draft, eventTime, mkProvenance } from "./util";

export function siteToEvidence(report: any): EvidenceDraft[] {
  if (!report?.domain) return [];
  const domain = String(report.domain).toLowerCase();
  const ek = `domain:${domain}`;
  const at = report.fetchedAt || report.finalUrl || new Date(0).toISOString();
  const url = report.url || `https://${domain}/`;
  const out: EvidenceDraft[] = [];
  const infra = report.infrastructure || {};
  const P = (sourceClass: string, extra?: Partial<Parameters<typeof mkProvenance>[0]>) =>
    mkProvenance({ sourceClass, sourceUrl: url, collectedAt: at, ...extra });

  const netOrg = (raw?: string) => { const n = normalizeNetOrg(raw); if (n) out.push(draft({ entityKey: ek, kind: "net_org", value: n, provenance: P("ip_enrichment") })); };

  // RDAP (T1)
  const dom = infra.domain?.value;
  if (dom?.createdAt) out.push(draft({ entityKey: ek, kind: "domain_created", value: dom.createdAt, eventTime: eventTime(dom.createdAt, "T1"), provenance: P("rdap") }));
  if (dom?.registrar) out.push(draft({ entityKey: ek, kind: "registrar", value: dom.registrar, provenance: P("rdap") }));

  // Hosting / IP / ASN (live infra)
  const host = infra.hosting?.value;
  if (host?.ip) out.push(draft({ entityKey: ek, kind: "ip", value: host.ip, provenance: P("ip_enrichment") }));
  if (host?.asn) out.push(draft({ entityKey: ek, kind: "asn", value: String(host.asn).toUpperCase(), provenance: P("ip_enrichment") }));
  netOrg(host?.asnOrg);

  // SSL SANs (T1 at validFrom)
  const ssl = infra.ssl?.value;
  const vf = ssl?.validFrom;
  for (const san of Array.isArray(ssl?.sanDomains) ? ssl.sanDomains : []) {
    out.push(draft({ entityKey: ek, kind: "ssl_san", value: String(san).toLowerCase(), eventTime: eventTime(vf, "T1"), provenance: P("ssl_ct") }));
  }

  // Page artifacts: analytics / ad ids
  const tech = infra.tech?.value;
  for (const g of Array.isArray(tech?.gaIds) ? tech.gaIds : []) out.push(draft({ entityKey: ek, kind: "ga_id", value: String(g).toUpperCase(), provenance: P("dns_live", { acquisitionMethod: "embedded in fetched page" }) }));
  for (const a of Array.isArray(tech?.adsenseIds) ? tech.adsenseIds : []) out.push(draft({ entityKey: ek, kind: "adsense_id", value: String(a).toLowerCase(), provenance: P("dns_live", { acquisitionMethod: "embedded in fetched page" }) }));

  // Archive first-seen (T2)
  const fs = infra.archive?.value?.firstSeen;
  if (fs) out.push(draft({ entityKey: ek, kind: "archive_first_seen", value: fs, eventTime: eventTime(fs, "T2"), provenance: P("wayback") }));

  // Origin trace (probabilistic; live DNS)
  const ot = report.originTrace;
  const lo = ot?.likelyOrigin;
  if (lo?.ip) { out.push(draft({ entityKey: ek, kind: "origin_ip", value: lo.ip, notes: [lo.country, lo.asnOrg].filter(Boolean).join(" · "), provenance: P("dns_live", { acquisitionMethod: ot?.methods?.join(", ") || "origin discovery" }) })); netOrg(lo.asnOrg); }
  for (const c of Array.isArray(ot?.candidates) ? ot.candidates : []) { if (c?.ip && !c.isCdn) netOrg(c.asnOrg); }

  // Geography endpoints: NS / MX + their operators + nameserver registrable domains
  const geo = report.geography || report.geo || {};
  for (const ns of Array.isArray(geo.dns) ? geo.dns : []) {
    if (ns?.host) { out.push(draft({ entityKey: ek, kind: "ns", value: String(ns.host).toLowerCase(), provenance: P("dns_live") })); const rd = regDomain(ns.host); if (rd) netOrg(rd.split(".")[0]); }
    netOrg(ns?.asnOrg);
  }
  for (const mx of Array.isArray(geo.mail) ? geo.mail : []) { if (mx?.host) out.push(draft({ entityKey: ek, kind: "mx", value: String(mx.host).toLowerCase(), provenance: P("dns_live") })); }
  netOrg(geo.server?.asnOrg);

  return out;
}
