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
