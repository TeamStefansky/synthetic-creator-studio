// Email Tracer -> EvidenceItem drafts (layer 03 · P1). The origin hop's Received
// header time is T2 (a relaying MTA observed it; upstream hops are asserted).
// Assets you own only. No person data - infrastructure and auth results only.

import { normalizeNetOrg } from "@/lib/clues/extract";
import type { EvidenceDraft } from "../types";
import { draft, eventTime, mkProvenance } from "./util";

export function emailToEvidence(trace: any): EvidenceDraft[] {
  if (!trace) return [];
  const out: EvidenceDraft[] = [];
  const domain = (trace.domain || "").toLowerCase();
  const ek = domain ? `domain:${domain}` : `ip:${trace.originIp || "unknown"}`;
  const hop0 = Array.isArray(trace.hops) ? trace.hops[0] : undefined;
  const at = hop0?.timestamp || new Date(0).toISOString();

  if (trace.originIp) {
    out.push(draft({
      entityKey: ek, kind: "email_origin", value: trace.originIp,
      eventTime: eventTime(hop0?.timestamp, "T2"),
      notes: [trace.originCountry, hop0?.enrichment?.asnOrg].filter(Boolean).join(" · "),
      provenance: mkProvenance({ sourceClass: "received_header", collectedAt: at, collector: "email", lineageId: `received:${trace.originIp}` }),
    }));
    const org = normalizeNetOrg(hop0?.enrichment?.asnOrg);
    if (org) out.push(draft({ entityKey: ek, kind: "net_org", value: org, provenance: mkProvenance({ sourceClass: "ip_enrichment", collectedAt: at, lineageId: `ip_enrichment:${trace.originIp}` }) }));
  }
  if (trace.auth?.verdict) {
    out.push(draft({
      entityKey: ek, kind: "auth_result",
      value: `spf=${trace.auth.spf ?? "?"};dkim=${trace.auth.dkim ?? "?"};dmarc=${trace.auth.dmarc ?? "?"}`,
      notes: trace.auth.spoofingLikely ? "spoofing likely" : trace.auth.verdict,
      provenance: mkProvenance({ sourceClass: "received_header", collectedAt: at, collector: "email", lineageId: `auth:${ek}` }),
    }));
  }
  return out;
}
