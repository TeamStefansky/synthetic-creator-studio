// Bot-farm / coordination signal aggregator.
//
// Combines signals already computed elsewhere in the report — operator-network
// siblings on shared infrastructure, shared identifiers with known-fake sites,
// datacenter hosting, and domain age — into a single "Coordination likelihood"
// indicator with its contributing evidence itemized.
//
// Social-amplification detection (synchronized posting, near-duplicate accounts)
// is optional and gated behind SOCIAL_API_KEY; without it, that signal is
// skipped gracefully.

import type {
  Coordination,
  EvidenceItem,
  HostingInfo,
  OperatorNetwork,
  DomainInfo,
} from "./types";

interface CoordinationInput {
  network: OperatorNetwork;
  hosting: HostingInfo;
  domain: DomainInfo;
  sharesWithFake: { shared: boolean; via: string | null };
}

export function assessCoordination(input: CoordinationInput): Coordination {
  const { network, hosting, domain, sharesWithFake } = input;
  const evidence: EvidenceItem[] = [];
  let score = 0;

  const add = (label: string, impact: number, detail: string) => {
    score += impact;
    evidence.push({ label, impact, detail });
  };

  // Count sibling DOMAIN nodes (exclude id/ga/adsense pseudo-nodes and target).
  const siblingDomains = network.nodes.filter(
    (n) => n.kind === "domain"
  ).length;

  if (siblingDomains >= 15)
    add("Large shared-infrastructure cluster", 3, `${siblingDomains} sibling domains linked by shared IP / analytics-ad IDs / SSL SAN.`);
  else if (siblingDomains >= 5)
    add("Shared-infrastructure cluster", 2, `${siblingDomains} sibling domains share infrastructure with this site.`);
  else if (siblingDomains >= 1)
    add("Some shared infrastructure", 1, `${siblingDomains} sibling domain(s) linked to this site.`);

  if (sharesWithFake.shared)
    add("Shares infrastructure with a flagged site", 3, `Shares ${sharesWithFake.via} with a known-fake domain — a hallmark of coordinated networks.`);

  if (hosting.isDatacenter)
    add("Datacenter-hosted", 1, `Hosted on a datacenter/hosting ASN${hosting.org ? ` (${hosting.org})` : ""}.`);

  if (domain.ageDays !== null && domain.ageDays < 180)
    add("Recently registered", 1, `Domain registered ${domain.ageDays} days ago; coordinated networks often spin up fresh domains together.`);

  // Optional social-amplification signal.
  if (process.env.SOCIAL_API_KEY) {
    // Placeholder for a configured social API; without live wiring we note the
    // capability rather than fabricate results.
    add("Social API configured", 0, "A social API key is present; synchronized-posting analysis can be enabled.");
  }

  const likelihood: Coordination["likelihood"] =
    score >= 5 ? "High" : score >= 2 ? "Medium" : "Low";

  evidence.sort((a, b) => b.impact - a.impact);
  return { likelihood, score, evidence };
}
