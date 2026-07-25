// Log Analyzer -> EvidenceItem drafts (layer 03 · P1). Own/third-party server
// logs are T1 (a system observed the request at the time). One record per top IP,
// plus its network operator. Assets you own only (the tool's existing gating).

import { normalizeNetOrg } from "@/lib/clues/extract";
import type { EvidenceDraft } from "../types";
import { draft, eventTime, mkProvenance } from "./util";

export function logsToEvidence(logs: any, subject = "logs"): EvidenceDraft[] {
  if (!logs || !Array.isArray(logs.topIps)) return [];
  const out: EvidenceDraft[] = [];
  for (const agg of logs.topIps) {
    const ip = agg?.ip;
    if (!ip) continue;
    const ek = `ip:${ip}`;
    const firstSeen = agg.contentPath?.[0]?.timestamp;
    const collectedAt = firstSeen || logs.timeline?.[0]?.bucket || new Date(0).toISOString();
    out.push(draft({
      entityKey: ek, kind: "ip", value: ip,
      eventTime: eventTime(firstSeen, "T1"),
      notes: `${agg.requests ?? 0} requests${agg.flags?.length ? ` · ${agg.flags.join(",")}` : ""}`,
      provenance: mkProvenance({ sourceClass: "server_log", collectedAt, collector: `log:${subject}`, lineageId: `server_log:${subject}` }),
    }));
    const org = normalizeNetOrg(agg.enrichment?.asnOrg);
    if (org) out.push(draft({ entityKey: ek, kind: "net_org", value: org, provenance: mkProvenance({ sourceClass: "ip_enrichment", collectedAt, lineageId: `ip_enrichment:${ip}` }) }));
    if (agg.enrichment?.asn) out.push(draft({ entityKey: ek, kind: "asn", value: String(agg.enrichment.asn).toUpperCase(), provenance: mkProvenance({ sourceClass: "ip_enrichment", collectedAt, lineageId: `ip_enrichment:${ip}` }) }));
  }
  return out;
}
