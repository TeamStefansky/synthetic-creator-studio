// Clusters (layer 03 · P3). Connected components over board links with ONE hard
// rule: only Moderate+ edges create or extend a component; weak edges may display
// inside a component but never join two. Cluster confidence is the weakest
// load-bearing (bridging) link — never a max/sum/average. Articulation edges are
// fragility indicators; evidence-level sensitivity names the single item the
// conclusion most depends on.

import type { ConfidenceLevel } from "@/components/ConfidenceBadge";
import { bridges, connectedComponents } from "./graph";

export const CLUSTER_MIN_STRENGTH: ConfidenceLevel = "Medium"; // "Moderate+"
export const STRENGTH_RANK: Record<ConfidenceLevel, number> = { Unknown: 0, Low: 1, Medium: 2, High: 3 };

export interface StrengthEdge {
  a: string;
  b: string;
  strength: ConfidenceLevel;
  evidenceId?: string;   // the load-bearing evidence item behind this edge
  reason?: string;
  // Layer 06: class characteristics never individualize, so a class edge — even at
  // Moderate+ — displays but never FORMS a cluster. Undefined is treated as
  // allowed (backward-compatible with pre-06 callers).
  characteristic?: "class" | "individual";
}

export interface Cluster {
  id: number;
  members: string[];
  confidence: ConfidenceLevel;          // weakest bridging link (Unknown for a singleton)
  bridgingEdges: StrengthEdge[];        // Moderate+ edges holding it together
  weakEdgesInside: StrengthEdge[];      // Low edges shown but not load-bearing
  articulationEdges: StrengthEdge[];    // removal splits the component (fragility)
  dependsOn?: { edge: StrengthEdge; why: string }; // evidence-level sensitivity
}

const isModeratePlus = (e: StrengthEdge) => STRENGTH_RANK[e.strength] >= STRENGTH_RANK[CLUSTER_MIN_STRENGTH];
// A cluster-forming edge is Moderate+ AND not a pure class characteristic — class
// features narrow a population but can never individualize into a cluster.
const formsCluster = (e: StrengthEdge) => isModeratePlus(e) && e.characteristic !== "class";
const norm = (a: string, b: string) => (a < b ? { a, b } : { a: b, b: a });
const eqEdge = (e: StrengthEdge, a: string, b: string) => (e.a === a && e.b === b) || (e.a === b && e.b === a);

/**
 * Build clusters. Components form over Moderate+ edges only; Low edges are kept
 * for display within a component and can never merge two. Pure + deterministic.
 */
export function buildClusters(nodes: string[], edges: StrengthEdge[]): Cluster[] {
  const strong = edges.filter(formsCluster);
  const comps = connectedComponents(nodes, strong.map((e) => ({ a: e.a, b: e.b })));

  return comps.map((members, id): Cluster => {
    const inSet = new Set(members);
    const bridging = strong.filter((e) => inSet.has(e.a) && inSet.has(e.b));
    // Display-only edges inside the component: weak, OR Moderate+ but class-only.
    const weakInside = edges.filter((e) => !formsCluster(e) && inSet.has(e.a) && inSet.has(e.b));

    // Weakest load-bearing link. Singleton (no bridging edge) => Unknown.
    const confidence: ConfidenceLevel = bridging.length
      ? bridging.reduce<ConfidenceLevel>((min, e) => (STRENGTH_RANK[e.strength] < STRENGTH_RANK[min] ? e.strength : min), "High")
      : "Unknown";

    // Articulation edges among the bridging set (fragility).
    const artRaw = bridges(members, bridging.map((e) => norm(e.a, e.b)));
    const articulationEdges = artRaw
      .map((ae) => bridging.find((e) => eqEdge(e, ae.a, ae.b)))
      .filter((e): e is StrengthEdge => !!e);

    // Evidence-level sensitivity: the single item whose removal most degrades the
    // cluster — a bridge that also carries the weakest strength is the most fragile.
    let dependsOn: Cluster["dependsOn"];
    if (bridging.length) {
      const candidates = (articulationEdges.length ? articulationEdges : bridging)
        .slice()
        .sort((x, y) => STRENGTH_RANK[x.strength] - STRENGTH_RANK[y.strength] || (x.a + x.b).localeCompare(y.a + y.b));
      const pick = candidates[0];
      dependsOn = {
        edge: pick,
        why: articulationEdges.includes(pick)
          ? `removing this ${pick.strength} link (${pick.a}↔${pick.b}) splits the cluster`
          : `this ${pick.strength} link (${pick.a}↔${pick.b}) is the weakest load-bearing edge`,
      };
    }

    return { id, members, confidence, bridgingEdges: bridging, weakEdgesInside: weakInside, articulationEdges, dependsOn };
  });
}
