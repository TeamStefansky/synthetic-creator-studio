// The operator network graph: link a domain to sibling domains that share the same
// IP, GA ID, AdSense ID, SSL SAN, or reverse-IP neighbour. ONE builder
// (buildOperatorGraph) merges N domains' infrastructure into a single node/edge
// set - shared ids become shared nodes, which IS the network. Site Report calls it
// with one domain; the Link Board calls it (via buildLinkNetwork) with many.

import { fakeDomains } from "./reputation";
import type { OperatorNetwork, GraphNode, GraphEdge, Infrastructure } from "./types";

const fakeSet = new Set(fakeDomains());

export function isFakeDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  for (const f of fakeSet) {
    if (d === f || d.endsWith("." + f)) return true;
  }
  return false;
}

// Reverse-IP neighbours are only a meaningful operator signal on DEDICATED
// hosting. On a CDN or shared host one IP serves thousands of unrelated sites, so
// co-tenants are hidden as noise. This threshold is the boundary.
export const SHARED_IP_THRESHOLD = 12;

/** One domain's infrastructure, projected into graph inputs. `ipIsShared` is the
 * caller's decision (CDN flag and/or neighbour-count threshold). */
export interface NodeGraphInput {
  domain: string;
  ip?: string;
  neighbors?: string[];
  ipIsShared: boolean;
  neighborSlice?: number; // dedicated co-tenants to show (default 25)
  sans?: string[];
  gaIds?: string[];
  adsenseIds?: string[];
}

export interface OperatorGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hiddenSharedIpCount: number;
}

/**
 * Shared operator-graph builder. Merges one or more domains' infrastructure into a
 * single deduped node/edge set. `flagFake`, when provided, marks known-fake
 * domain/target nodes (Site Report supplies it; the Link Board does not, keeping
 * its current behaviour). No network calls - pure over the projected inputs.
 */
export function buildOperatorGraph(
  inputs: NodeGraphInput[],
  flagFake?: (domain: string) => boolean,
): OperatorGraphResult {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenEdge = new Set<string>();
  const ff = (d: string) => (flagFake ? flagFake(d) : false);

  const addNode = (id: string, label: string, kind: GraphNode["kind"], fake = false) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind, flaggedFake: fake });
  };
  const addEdge = (source: string, target: string, reason: string) => {
    if (source === target) return;
    const k = `${source}|${target}|${reason}`;
    if (seenEdge.has(k)) return;
    seenEdge.add(k);
    edges.push({ source, target, reason });
  };

  let hiddenSharedIpCount = 0;
  for (const inp of inputs) {
    const target = inp.domain.toLowerCase();
    addNode(target, target, "target", ff(target));
    const slice = inp.neighborSlice ?? 25;

    // Always show the site's own IP node.
    if (inp.ip) {
      const ipId = `ip:${inp.ip}`;
      addNode(ipId, inp.ip, "ip");
      addEdge(target, ipId, "hosted on IP");
      const neighbors = (inp.neighbors || [])
        .map((n) => n.toLowerCase().replace(/^www\./, ""))
        .filter((d) => d && d !== target);
      if (inp.ipIsShared) {
        hiddenSharedIpCount += neighbors.length;
      } else {
        // Dedicated / small set → these neighbours are plausibly operator-linked.
        for (const d of neighbors.slice(0, slice)) {
          addNode(d, d, "domain", ff(d));
          addEdge(ipId, d, "shared dedicated IP");
        }
      }
    }

    // Shared SSL SAN domains (strong operator signal).
    for (const san of (inp.sans || []).slice(0, 25)) {
      addNode(san, san, "domain", ff(san));
      addEdge(target, san, "shared SSL certificate (SAN)");
    }
    // Shared GA / AdSense identifiers (sibling hubs).
    for (const ga of inp.gaIds || []) {
      const gid = `ga:${ga}`;
      addNode(gid, ga, "ga");
      addEdge(target, gid, "Google Analytics ID");
    }
    for (const ad of inp.adsenseIds || []) {
      const aid = `ad:${ad}`;
      addNode(aid, ad, "adsense");
      addEdge(target, aid, "AdSense ID");
    }
  }

  return { nodes: [...nodes.values()], edges, hiddenSharedIpCount };
}

export interface NetworkInput {
  domain: string;
  infrastructure: Infrastructure;
  reverseIpNeighbors: string[];
}

/** Site Report's single-domain operator network (thin adapter over the shared
 * builder). Flags known-fake domains; keeps the CDN-specific "hidden" note. */
export function buildNetwork(input: NetworkInput): OperatorNetwork {
  const { domain, infrastructure, reverseIpNeighbors } = input;
  const host = infrastructure.hosting.value;
  const ssl = infrastructure.ssl.value;
  const tech = infrastructure.tech.value;

  const target = domain.toLowerCase();
  const cleanNeighbors = reverseIpNeighbors
    .map((n) => n.toLowerCase().replace(/^www\./, ""))
    .filter((d) => d && d !== target);
  const ipIsShared = !!host?.cdnMasksOrigin || cleanNeighbors.length > SHARED_IP_THRESHOLD;

  const { nodes, edges, hiddenSharedIpCount } = buildOperatorGraph(
    [{
      domain: target,
      ip: host?.ip,
      neighbors: cleanNeighbors,
      ipIsShared,
      neighborSlice: 25,
      sans: ssl?.sanDomains,
      gaIds: tech?.gaIds,
      adsenseIds: tech?.adsenseIds,
    }],
    isFakeDomain,
  );

  const note = ipIsShared && host?.ip
    ? (host?.cdnMasksOrigin
        ? `Behind ${host.cdn || "a CDN"} - this IP is shared by many unrelated sites, so co-tenant domains are hidden. Links shown reflect stronger operator signals (shared analytics/ad IDs and SSL certificates).`
        : `This IP appears to be shared hosting (${cleanNeighbors.length}+ unrelated domains), so co-tenant domains are hidden to avoid false links. Showing only stronger operator signals.`)
    : undefined;

  return { nodes, edges, note, hiddenSharedIpCount };
}
