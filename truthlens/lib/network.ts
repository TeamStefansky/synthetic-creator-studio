// Build the operator network graph.
// The target domain is linked to "sibling" domains that share any of:
//   - the same hosting IP
//   - the same Google Analytics ID
//   - the same AdSense ID
//   - membership in the same SSL certificate (SAN domains)
//   - (optional) reverse-IP neighbors on the same server
//
// Nodes matching the known-fake list are flagged red. The function also reports
// whether the target shares infrastructure with any known-fake domain, which
// feeds the risk score.

import type {
  GraphEdge,
  GraphNode,
  Infrastructure,
  OperatorNetwork,
} from "./types";
import { fakeList } from "./reputation";

interface NetworkInput {
  domain: string;
  infra: Infrastructure;
  reverseIpNeighbors: string[];
}

interface NetworkResult {
  network: OperatorNetwork;
  sharesWithFake: { shared: boolean; via: string | null };
}

const FAKE = new Set(fakeList());

function isFake(domain: string): boolean {
  for (const f of FAKE) {
    if (domain === f || domain.endsWith(`.${f}`)) return true;
  }
  return false;
}

export function buildNetwork(input: NetworkInput): NetworkResult {
  const { domain, infra } = input;
  const reverseNeighbors = input.reverseIpNeighbors;

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let sharesWithFake = false;
  let sharesVia: string | null = null;

  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (source: string, target: string, reason: string) => {
    edges.push({ source, target, reason });
  };

  // Target node (always present, distinctly colored in the UI).
  addNode({
    id: domain,
    label: domain,
    kind: "target",
    known: isFake(domain) ? "fake" : undefined,
  });

  const linkSibling = (sibling: string, reason: string, via: string) => {
    if (!sibling || sibling === domain) return;
    const fake = isFake(sibling);
    addNode({
      id: sibling,
      label: sibling,
      kind: "domain",
      known: fake ? "fake" : undefined,
    });
    addEdge(domain, sibling, reason);
    if (fake) {
      sharesWithFake = true;
      sharesVia = sharesVia ?? via;
    }
  };

  // ---- Shared IP ----------------------------------------------------------
  const ip = infra.hosting.ip;
  if (ip) {
    addNode({ id: `ip:${ip}`, label: ip, kind: "ip" });
    addEdge(domain, `ip:${ip}`, "Hosted on this IP");
    for (const neighbor of reverseNeighbors) {
      const n = neighbor.replace(/^www\./, "");
      if (n === domain) continue;
      const fake = isFake(n);
      addNode({ id: n, label: n, kind: "domain", known: fake ? "fake" : undefined });
      addEdge(`ip:${ip}`, n, "Shares this IP");
      if (fake) {
        sharesWithFake = true;
        sharesVia = sharesVia ?? "an IP address";
      }
    }
  }

  // ---- Shared Google Analytics IDs ---------------------------------------
  for (const ga of infra.tech.gaIds) {
    addNode({ id: `ga:${ga}`, label: ga, kind: "ga" });
    addEdge(domain, `ga:${ga}`, "Uses this Analytics ID");
  }

  // ---- Shared AdSense IDs -------------------------------------------------
  for (const ad of infra.tech.adsenseIds) {
    addNode({ id: `adsense:${ad}`, label: ad, kind: "adsense" });
    addEdge(domain, `adsense:${ad}`, "Uses this AdSense ID");
  }

  // ---- SAN sibling domains (same SSL certificate) ------------------------
  for (const san of infra.ssl.sanDomains) {
    const s = san.replace(/^www\./, "");
    if (s === domain) continue;
    linkSibling(s, "On the same SSL certificate", "an SSL certificate");
  }

  return {
    network: { nodes: Array.from(nodes.values()), edges },
    sharesWithFake: { shared: sharesWithFake, via: sharesVia },
  };
}
