// Operator / host reputation (Site Report + Link Board). Given a site's
// infrastructure, surface DOCUMENTED, CITED, ORGANIZATION-LEVEL facts about the
// hosting operator / network / nameserver operator: what else sits on the same
// infrastructure, whether the operator appears on public sanctions lists, and
// whether the operator's own infrastructure or a co-hosted domain is on a
// documented-campaign / state-media / foreign-agent reference list.
//
// Frozen-rule compliant: organizations only (never a person); every flag carries
// confidence + evidence + an innocent alternative + a citation; an unavailable
// source shows honestly as "not connected"; neutral - it surfaces documented
// facts for ANY operator, in any direction. A co-hosted match is CONTEXT, not
// guilt: shared/CDN hosting places unrelated sites together.

import { normalizeNetOrg, regDomain } from "@/lib/clues/extract";
import { campaignMatch, stateMediaMatch, foreignAgentMatch } from "@/lib/io-reference";
import { screenSanctions } from "@/lib/opensanctions";
import { lookupPublicOfficers, type PublicRecordsResult } from "@/lib/public-records";

export const OPERATOR_REPUTATION_VERSION = "operator-reputation-v2";

// A sanctions/watchlist name-match must clear a strong score before it is shown at
// all - a weak fuzzy match on an org string is exactly how a garbage "hit" (an
// unrelated person's name) leaks in. Confidence is derived from the score, never
// asserted. Screening runs on the REAL operator, never on a mega-provider/CDN
// frontend (screening "Google LLC" or "Cloudflare, Inc." is meaningless).
const SANCTIONS_SURFACE_MIN = 0.85; // below this: not shown
const SANCTIONS_HIGH = 0.92;        // at/above this: High
const SANCTIONS_PERSON_MIN = 0.95;  // org-name → Person hit needs near-exact (usually coincidence)

export function sanctionConfidence(score: number | null, schema: string): FlagConfidence | null {
  if (score == null) return null; // no score => can't assert strength; caller falls back to caption match
  const isPerson = /person/i.test(schema);
  if (isPerson && score < SANCTIONS_PERSON_MIN) return null;
  if (score < SANCTIONS_SURFACE_MIN) return null;
  if (isPerson) return "Medium"; // an org-name matching a person is capped - never High
  return score >= SANCTIONS_HIGH ? "High" : "Medium";
}

// Fallback when the API returns no score: keep the hit only if the query's
// significant tokens actually appear in the designated entity's caption.
function captionMatches(query: string, caption: string): boolean {
  const toks = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (!toks.length) return false;
  const cap = caption.toLowerCase();
  return toks.every((t) => cap.includes(t));
}

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
  asnOrg?: string;            // raw hosting/network org label (real operator when known)
  asnOrgIsFrontend?: boolean; // true when asnOrg is only a CDN/mega-provider frontend, not the real operator
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
    : "Shared/CDN hosting places unrelated sites together - a co-hosted match is context about the neighbourhood, not evidence about this site.";
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
  // The REAL operator(s): raw asnOrg strings that survive the mega-provider filter
  // (normalizeNetOrg returns null for Google/Cloudflare/etc.). Sanctions + officer
  // lookups run on these - never on the CDN frontend. Display prefers a real one.
  const realAsnOrgs = [...new Set((input.asnOrgs || []).filter((s): s is string => !!s && !!normalizeNetOrg(s)))];
  const asnOrg = realAsnOrgs[0] || (input.asnOrgs || []).find((s) => !!s) || undefined;

  const nsDomains = [...new Set((input.nameserverHosts || []).map((h) => regDomain(h)).filter((d): d is string => !!d))];
  const coHosted = [...new Set(input.coHosted || [])];

  const flags: OperatorFlag[] = [];
  for (const d of nsDomains) flags.push(...refFlags(d, true));
  for (const d of coHosted.slice(0, 50)) flags.push(...refFlags(d, false));

  // Sanctions screening on the REAL operator org(s) - key-gated -> honest
  // not-connected. Only strong matches surface; weak fuzzy matches (the source of
  // garbage "hits" like an unrelated person's name) are dropped, never shown.
  let sanctions: OperatorReputation["sanctions"] = { connected: false, hits: 0 };
  let surfaced = 0;
  for (const target of realAsnOrgs.slice(0, 2)) {
    try {
      const screen = await screenSanctions(target);
      if (!sanctions.connected) sanctions = { connected: screen.connected, reason: screen.reason, hits: 0 };
      if (!screen.connected) continue;
      for (const h of screen.hits) {
        const conf = sanctionConfidence(h.score, h.schema)
          ?? (h.score == null && captionMatches(target, h.caption) ? "Medium" : null);
        if (!conf) continue; // weak/irrelevant match: not shown
        surfaced++;
        flags.push({ kind: "sanctions", subject: target, detail: `possible public sanctions/watchlist match: ${h.caption} (${h.schema}${h.score != null ? `, score ${h.score.toFixed(2)}` : ""}; ${h.datasets.slice(0, 3).join(", ")})`, citation: h.url, confidence: conf, onOwnInfra: true, alternative: "A name match is not proof of identity - the designated entity may be a different party with a similar name; confirm against the cited source before acting." });
      }
    } catch { /* leave not-connected */ }
  }
  sanctions.hits = surfaced;

  // Public-record officer disclosure on the REAL operator org (key-gated, cited).
  let publicOfficers: PublicRecordsResult | undefined;
  if (asnOrg && realAsnOrgs.length) { try { publicOfficers = await lookupPublicOfficers(realAsnOrgs[0]); } catch { /* leave undefined */ } }

  // Rank: on-own-infra + higher confidence first.
  const rank = { High: 3, Medium: 2, Low: 1 } as const;
  flags.sort((a, b) => Number(b.onOwnInfra) - Number(a.onOwnInfra) || rank[b.confidence] - rank[a.confidence]);

  return {
    version: OPERATOR_REPUTATION_VERSION,
    operators, asnOrg,
    asnOrgIsFrontend: !realAsnOrgs.length && !!asnOrg,
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
