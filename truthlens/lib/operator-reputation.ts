// Operator / host reputation (Site Report + Link Board). Given a site's
// infrastructure, surface DOCUMENTED, CITED, ORGANIZATION-LEVEL facts about the
// hosting operator / network / nameserver operator: what else sits on the same
// infrastructure, whether the operator appears on public sanctions lists, and
// whether the operator's own infrastructure or a co-hosted domain is on a
// documented-campaign / state-media / foreign-agent reference list.
//
// Frozen-rule compliant: organizations only (never a person); every flag carries
// confidence + evidence + an innocent alternative + a citation; an unavailable
// source shows honestly as "not connected"; neutral — it surfaces documented
// facts for ANY operator, in any direction. A co-hosted match is CONTEXT, not
// guilt: shared/CDN hosting places unrelated sites together.

import { normalizeNetOrg, regDomain } from "@/lib/clues/extract";
import { campaignMatch, stateMediaMatch, foreignAgentMatch } from "@/lib/io-reference";
import { screenSanctions } from "@/lib/opensanctions";
import { lookupPublicOfficers, type PublicRecordsResult } from "@/lib/public-records";

export const OPERATOR_REPUTATION_VERSION = "operator-reputation-v1";

export type OperatorFlagKind = "sanctions" | "documented_campaign" | "state_media" | "foreign_agent";
export type FlagConfidence = "Low" | "Medium" | "High";

export interface OperatorFlag {
  kind: OperatorFlagKind;
  subject: string;      // the org / domain that matched
  detail: string;
  citation?: string;    // source URL / registry / report
  confidence: FlagConfidence;
  onOwnInfra: boolean;  // true = the operator's own NS/org; false = a co-hosted neighbour
  alternative: string;
}

export interface OperatorReputation {
  version: string;
  operators: string[];        // normalized operator tokens (e.g. "1984")
  asnOrg?: string;            // raw hosting/network org label
  coHostedCount: number;
  coHostedSample: string[];
  flags: OperatorFlag[];      // documented, cited concerns (empty is a valid result)
  sanctions: { connected: boolean; reason?: string; hits: number };
  /** Officers disclosed in an official public register (cited), if a key is set. */
  publicOfficers?: PublicRecordsResult;
  note: string;
}

export interface OperatorReputationInput {
  asnOrgs?: (string | undefined)[];   // hosting.asnOrg, origin likelyOrigin.asnOrg, ...
  nameserverHosts?: (string | undefined)[]; // geography.dns[].host
  coHosted?: string[];                // reverse-IP neighbour domains
}

function refFlags(domain: string, onOwnInfra: boolean): OperatorFlag[] {
  const out: OperatorFlag[] = [];
  const alt = onOwnInfra
    ? "A documented-list match on the operator's own infrastructure is suggestive but still org-level; confirm the entry refers to this operator."
    : "Shared/CDN hosting places unrelated sites together — a co-hosted match is context about the neighbourhood, not evidence about this site.";
  const c = campaignMatch(domain);
  if (c) out.push({ kind: "documented_campaign", subject: domain, detail: `documented influence campaign${c.campaign ? `: ${c.campaign}` : ""}${c.disclosedBy ? ` (disclosed by ${c.disclosedBy})` : ""}`, citation: c.report, confidence: onOwnInfra ? "Medium" : "Low", onOwnInfra, alternative: alt });
  const sm = stateMediaMatch(domain);
  if (sm) out.push({ kind: "state_media", subject: domain, detail: `state-affiliated media${sm.label ? `: ${sm.label}` : ""}`, citation: sm.source, confidence: onOwnInfra ? "Medium" : "Low", onOwnInfra, alternative: alt });
  const fa = foreignAgentMatch(domain);
  if (fa) out.push({ kind: "foreign_agent", subject: domain, detail: `disclosed foreign-principal relationship under ${fa.registry || "a registry"}${fa.org ? ` (${fa.org})` : ""}`, citation: fa.filingUrl, confidence: "Low", onOwnInfra, alternative: "Registry disclosure is transparency context under law, not a wrongdoing flag." });
  return out;
}

export async function assessOperatorReputation(input: OperatorReputationInput): Promise<OperatorReputation> {
  const operators = [...new Set(
    (input.asnOrgs || []).map((s) => normalizeNetOrg(s)).filter((s): s is string => !!s)
      .concat((input.nameserverHosts || []).map((h) => { const rd = regDomain(h); return rd ? normalizeNetOrg(rd.split(".")[0]) : null; }).filter((s): s is string => !!s)),
  )];
  const asnOrg = (input.asnOrgs || []).find((s) => !!s) || undefined;

  const nsDomains = [...new Set((input.nameserverHosts || []).map((h) => regDomain(h)).filter((d): d is string => !!d))];
  const coHosted = [...new Set(input.coHosted || [])];

  const flags: OperatorFlag[] = [];
  for (const d of nsDomains) flags.push(...refFlags(d, true));
  for (const d of coHosted.slice(0, 50)) flags.push(...refFlags(d, false));

  // Sanctions screening on the operator org (key-gated -> honest not-connected).
  let sanctions: OperatorReputation["sanctions"] = { connected: false, hits: 0 };
  if (asnOrg) {
    try {
      const screen = await screenSanctions(asnOrg);
      sanctions = { connected: screen.connected, reason: screen.reason, hits: screen.hits.length };
      if (screen.connected && screen.hits.length) {
        const h = screen.hits[0];
        flags.push({ kind: "sanctions", subject: asnOrg, detail: `possible public sanctions/watchlist match: ${h.caption} (${h.datasets.slice(0, 3).join(", ")})`, citation: h.url, confidence: "High", onOwnInfra: true, alternative: "A name match is not proof of identity — the sanctioned entity may be a different organization with a similar name; confirm before acting." });
      }
    } catch { /* leave not-connected */ }
  }

  // Public-record officer disclosure on the operator org (key-gated, cited).
  let publicOfficers: PublicRecordsResult | undefined;
  if (asnOrg) { try { publicOfficers = await lookupPublicOfficers(asnOrg); } catch { /* leave undefined */ } }

  // Rank: on-own-infra + higher confidence first.
  const rank = { High: 3, Medium: 2, Low: 1 } as const;
  flags.sort((a, b) => Number(b.onOwnInfra) - Number(a.onOwnInfra) || rank[b.confidence] - rank[a.confidence]);

  return {
    version: OPERATOR_REPUTATION_VERSION,
    operators, asnOrg,
    coHostedCount: coHosted.length,
    coHostedSample: coHosted.slice(0, 12),
    flags,
    sanctions,
    publicOfficers,
    note: flags.length
      ? "Organization-level, cited facts about the hosting operator/network. Confidence + alternative on each; a co-hosted match is context, not guilt."
      : "No documented reference-list or sanctions match for this operator. A clean result is common and does not certify the operator.",
  };
}
