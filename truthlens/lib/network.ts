// Build the operator network graph: link the target domain to sibling domains
// that share the same IP, GA ID, AdSense ID, SSL SAN, or reverse-IP neighbor.

import { fakeDomains } from "./reputation";
import type { OperatorNetwork, GraphNode, GraphEdge, Infrastructure } from "./types";

const fakeSet = new Set(fakeDomains());

function isFake(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  for (const f of fakeSet) {
    if (d === f || d.endsWith("." + f)) return true;
  }
  return false;
}

export interface NetworkInput {
  domain: string;
  infrastructure: Infrastructure;
  reverseIpNeighbors: string[];
}

export function buildNetwork(input: NetworkInput): OperatorNetwork {
  const { domain, infrastructure, reverseIpNeighbors } = input;
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const target = domain.toLowerCase();
  nodes.set(target, { id: target, label: target, kind: "target", flaggedFake: isFake(target) });

  const addNode = (id: string, label: string, kind: GraphNode["kind"]) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, kind, flaggedFake: kind === "domain" ? isFake(id) : false });
    }
  };
  const addEdge = (from: string, to: string, reason: string) => {
    if (from === to) return;
    edges.push({ source: from, target: to, reason });
  };

  const host = infrastructure.hosting.value;
  const ssl = infrastructure.ssl.value;
  const tech = infrastructure.tech.value;

  // Shared IP hub + reverse-IP neighbors
  if (host?.ip) {
    const ipId = `ip:${host.ip}`;
    addNode(ipId, host.ip, "ip");
    addEdge(target, ipId, "hosted on IP");
    for (const n of reverseIpNeighbors.slice(0, 25)) {
      const d = n.toLowerCase().replace(/^www\./, "");
      if (d === target) continue;
      addNode(d, d, "domain");
      addEdge(ipId, d, "shared IP");
    }
  }

  // Shared SSL SAN domains
  for (const san of (ssl?.sanDomains || []).slice(0, 25)) {
    addNode(san, san, "domain");
    addEdge(target, san, "shared SSL certificate (SAN)");
  }

  // Shared GA / AdSense identifiers (sibling hubs)
  for (const ga of tech?.gaIds || []) {
    const gid = `ga:${ga}`;
    addNode(gid, ga, "ga");
    addEdge(target, gid, "Google Analytics ID");
  }
  for (const ad of tech?.adsenseIds || []) {
    const aid = `ad:${ad}`;
    addNode(aid, ad, "adsense");
    addEdge(target, aid, "AdSense ID");
  }

  return { nodes: Array.from(nodes.values()), edges };
}
