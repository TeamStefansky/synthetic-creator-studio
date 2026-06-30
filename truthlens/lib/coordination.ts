// Bot-farm / coordination likelihood. Combines signals already available from
// the operator graph, log analysis, and propagation into a Low/Medium/High
// indicator with the contributing evidence listed. Probabilistic — indicators,
// not proof.

import type {
  CoordinationResult,
  CoordinationLevel,
  OperatorNetwork,
  LogAnalysisResult,
  PropagationResult,
} from "./types";

export interface CoordinationInput {
  network?: OperatorNetwork;
  log?: LogAnalysisResult;
  propagation?: PropagationResult;
}

export function assessCoordination(input: CoordinationInput): CoordinationResult {
  const signals: { label: string; weight: number; detail: string }[] = [];
  let score = 0;

  const add = (label: string, weight: number, detail: string) => {
    score += weight;
    signals.push({ label, weight, detail });
  };

  // Operator graph: many sibling domains on shared infra.
  if (input.network) {
    const siblings = input.network.nodes.filter((n) => n.kind === "domain").length;
    if (siblings >= 20) add("Large sibling-domain cluster", 30, `${siblings} domains share infrastructure with the target.`);
    else if (siblings >= 5) add("Sibling-domain cluster", 18, `${siblings} domains share infrastructure with the target.`);
    const fakeSiblings = input.network.nodes.filter((n) => n.flaggedFake).length;
    if (fakeSiblings > 0) add("Flagged domains in the cluster", 15, `${fakeSiblings} cluster member(s) are on the known-fake list.`);
  }

  // Logs: datacenter-hosted traffic + duplicate UAs + synchronized bursts.
  if (input.log) {
    if (input.log.datacenterPct >= 40) add("Heavy datacenter traffic", 20, `${input.log.datacenterPct}% of enriched IPs are datacenter/hosting ASNs.`);
    else if (input.log.datacenterPct >= 20) add("Notable datacenter traffic", 10, `${input.log.datacenterPct}% of enriched IPs are datacenter/hosting ASNs.`);
    if (input.log.sharedUserAgents.length > 0) add("Duplicate User-Agents across IPs", 15, `${input.log.sharedUserAgents.length} User-Agent(s) reused across many distinct IPs.`);
    const bursts = input.log.timeline.filter((t) => t.burst).length;
    if (bursts > 0) add("Synchronized traffic bursts", 10, `${bursts} time-bucket(s) show coordinated spikes.`);
  }

  // Propagation: coordinated amplification across republishers.
  if (input.propagation?.coordinatedAmplification) {
    add("Coordinated content amplification", 15, "Multiple republishers overlap the operator network or amplify in unison.");
  }

  score = Math.min(100, score);
  let level: CoordinationLevel = "Low";
  if (score >= 50) level = "High";
  else if (score >= 25) level = "Medium";

  return {
    level,
    score,
    signals,
    note: "Coordination likelihood is an indicator built from observable signals — not proof of a single operator.",
  };
}
