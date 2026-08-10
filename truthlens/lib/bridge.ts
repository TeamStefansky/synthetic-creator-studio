// The infra <-> narrative bridge. Historically the OSINT (infrastructure) side and
// the narrative (fake-news) side were siloed. This module connects them, reusing
// the EXISTING engines rather than reimplementing them:
//
//   deepenAmplifiers()  narrative -> infra: given the domains amplifying a
//                       narrative, build the operator network behind them and
//                       assess those hosting operators' documented reputation
//                       (sanctions / io-reference / disclosed officers).
//
// HARD RULES: organizations / domains / infrastructure only - never a person node.
// Every surfaced concern carries confidence + evidence + an innocent alternative
// (via assessOperatorReputation). A shared operator is CONTEXT about the
// neighbourhood, not proof any single amplifier is state-directed.

import type { DomainIntel } from "@/lib/narrative/types";
import type { OperatorNetwork, GraphNode, GraphEdge } from "@/lib/types";
import { assessOperatorReputation, type OperatorReputation } from "@/lib/operator-reputation";
import { stateMediaMatch, campaignMatch, foreignAgentMatch } from "@/lib/io-reference";
import { lookupAmplifiers } from "@/lib/evidence-store";

export const BRIDGE_VERSION = "bridge-v1";

export interface AmplifierOperators {
  version: string;
  /** amplifier-domain nodes linked to the hosting operator (ASN) they share */
  network: OperatorNetwork;
  /** documented, cited reputation of the aggregate hosting operators */
  reputation: OperatorReputation;
  /** distinct hosting operators (ASNs) behind the enriched amplifiers */
  operatorCount: number;
  /** operators (ASNs) shared by 2+ amplifier domains - the connective tissue */
  sharedOperators: { asn: string; asnOrg?: string; domains: string[] }[];
}

/**
 * Narrative -> infra. Pure over already-enriched amplifier intel plus ONE
 * operator-reputation call (which itself reuses io-reference + sanctions, all
 * cached/key-gated). Returns undefined when no amplifier resolved to an ASN.
 */
export async function deepenAmplifiers(intel: DomainIntel[]): Promise<AmplifierOperators | undefined> {
  const withAsn = intel.filter((d) => d.asn);
  if (!withAsn.length) return undefined;

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const byAsn = new Map<string, { asnOrg?: string; domains: Set<string> }>();

  for (const d of withAsn) {
    nodes.set(d.domain, { id: d.domain, label: d.domain, kind: "domain" });
    const opId = `op:${d.asn}`;
    if (!nodes.has(opId)) nodes.set(opId, { id: opId, label: `host/operator: ${d.asnOrg || d.asn}`, kind: "ip" });
    edges.push({ source: d.domain, target: opId, reason: `hosted on ${d.asnOrg || d.asn}` });
    const g = byAsn.get(d.asn!) || { asnOrg: d.asnOrg, domains: new Set<string>() };
    g.domains.add(d.domain);
    byAsn.set(d.asn!, g);
  }

  const sharedOperators = [...byAsn.entries()]
    .filter(([, g]) => g.domains.size >= 2)
    .sort((a, b) => b[1].domains.size - a[1].domains.size)
    .map(([asn, g]) => ({ asn, asnOrg: g.asnOrg, domains: [...g.domains] }));

  // Assess the aggregate hosting operators (reuses sanctions + io-reference).
  const asnOrgs = [...new Set(withAsn.map((d) => d.asnOrg).filter((s): s is string => !!s))];
  const reputation = await assessOperatorReputation({ asnOrgs });

  return {
    version: BRIDGE_VERSION,
    network: { nodes: [...nodes.values()], edges },
    reputation,
    operatorCount: byAsn.size,
    sharedOperators,
  };
}

// ---------------------------------------------------------------------------
// infra -> narrative. Given the domains an infra tool surfaced (a Site Report's
// target + siblings, or a Link Board's set), report which of them (a) match a
// documented io-reference list and (b) amplify a monitored narrative. Each hit
// is a LEAD with an innocent alternative - co-hosting/syndication is context.
// ---------------------------------------------------------------------------

export type CrossHitKind = "state_media" | "documented_campaign" | "foreign_agent" | "narrative_amplifier";

export interface CrossHit {
  domain: string;
  kind: CrossHitKind;
  detail: string;
  citation?: string;
  narratives?: string[];
  confidence: "Low" | "Medium" | "High";
  alternative: string;
}

export interface CrossLookupResult {
  version: string;
  checked: number;
  registryConnected: boolean; // narrative-amplifier registry (KV) availability
  hits: CrossHit[];
}

const CO_HOSTING_ALT = "A documented-list match on a domain is org-level context; confirm the entry still refers to this domain before acting.";
const AMPLIFY_ALT = "Amplifying a monitored narrative can be ordinary coverage, syndication, or criticism - it is a lead to review, not proof of coordination.";

/** infra -> narrative cross-lookup. Pure io-reference matches + one KV read. */
export async function crossLookup(domains: string[]): Promise<CrossLookupResult> {
  const uniq = [...new Set(domains.map((d) => (d || "").toLowerCase().trim()).filter(Boolean))];
  const hits: CrossHit[] = [];

  for (const d of uniq) {
    const sm = stateMediaMatch(d);
    if (sm) hits.push({ domain: d, kind: "state_media", detail: `documented state-affiliated media${sm.label ? `: ${sm.label}` : ""}`, citation: sm.source, confidence: "Medium", alternative: CO_HOSTING_ALT });
    const c = campaignMatch(d);
    if (c) hits.push({ domain: d, kind: "documented_campaign", detail: `named in a documented influence-op${c.campaign ? `: ${c.campaign}` : ""}${c.disclosedBy ? ` (${c.disclosedBy})` : ""}`, citation: c.report, confidence: "Medium", alternative: CO_HOSTING_ALT });
    const fa = foreignAgentMatch(d);
    if (fa) hits.push({ domain: d, kind: "foreign_agent", detail: `disclosed foreign-agent registration under ${fa.registry || "a registry"}${fa.org ? ` (${fa.org})` : ""}`, citation: fa.filingUrl, confidence: "Low", alternative: "A foreign-agent registration is a lawful public disclosure, not a wrongdoing flag." });
  }

  const amp = await lookupAmplifiers(uniq);
  for (const [domain, rec] of Object.entries(amp.hits)) {
    hits.push({ domain, kind: "narrative_amplifier", detail: `also amplifies monitored narrative(s): ${rec.entities.slice(0, 5).join(", ")}`, narratives: rec.entities, confidence: "Low", alternative: AMPLIFY_ALT });
  }

  return { version: BRIDGE_VERSION, checked: uniq.length, registryConnected: amp.connected, hits };
}
