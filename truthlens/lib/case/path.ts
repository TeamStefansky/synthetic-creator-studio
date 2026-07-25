// Propagation path (layer 03 · P3). A directed graph over CLAIM INSTANCES —
// (claim × entity × earliest reliable time) — not over entities. An A→B edge is
// drawn only when both endpoints are T2+ and B's time exceeds A's by more than
// the wider tolerance AND clock skew (via orderOf), and a content relationship
// exists (instances of one claim cluster are near-duplicate content, so that
// holds by construction). When ordering fails, an explicit `order_not_established`
// edge is emitted — never silently dropped. Positional roles come from graph
// position only, each carrying the "a genuinely earlier instance may exist on a
// platform never ingested" alternative. Path confidence is capped by coverage.

import type { ConfidenceLevel } from "@/components/ConfidenceBadge";
import { orderOf, usableLowerBound } from "./calibrate-time";
import type { EventTime } from "./types";

export const PATH_VERSION = "case-path-v1";
export const COVERAGE_CAP: ConfidenceLevel = "Medium";

export type PathRole = "earliest_observed" | "amplifier" | "terminal" | "cross_language_bridge" | "isolated";
export const ROLE_ALTERNATIVE: Record<PathRole, string> = {
  earliest_observed: "a genuinely earlier instance may exist on a platform never ingested — this is earliest observed in collected data, not the source.",
  amplifier: "re-publishing may be independent reporting rather than coordinated amplification.",
  terminal: "later instances may exist beyond our collection window.",
  cross_language_bridge: "shared entities can appear in two languages independently, without a bridging actor.",
  isolated: "absence of a link may reflect missing collection, not an absent relationship.",
};

export interface PathInstance {
  id: string;
  claimId: string;
  entity: string;
  time?: EventTime;
  language?: string;
  hasArchiveCoverageBeforeStart?: boolean;
}

export interface PathEdge {
  from: string;
  to: string;
  kind: "directed" | "order_not_established";
  reason: string;
}

export interface PathNode {
  id: string;
  claimId: string;
  entity: string;
  role: PathRole;
  roleAlternative: string;
  at?: string;
  tier?: EventTime["tier"];
}

export interface CasePath {
  version: string;
  nodes: PathNode[];
  edges: PathEdge[];
  confidence: ConfidenceLevel;
  coverageReason?: string;
}

export function buildPath(instances: PathInstance[]): CasePath {
  const byClaim = new Map<string, PathInstance[]>();
  for (const inst of instances) { const a = byClaim.get(inst.claimId) || []; a.push(inst); byClaim.set(inst.claimId, a); }

  const edges: PathEdge[] = [];
  const outDeg = new Map<string, number>();
  const inDeg = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  for (const inst of instances) { outDeg.set(inst.id, 0); inDeg.set(inst.id, 0); }

  let coverageCapped = false;
  const coverageReasons: string[] = [];

  for (const [, group] of byClaim) {
    const sorted = [...group].sort((a, b) => {
      const la = usableLowerBound(a.time), lb = usableLowerBound(b.time);
      if (la !== null && lb !== null) return la - lb;
      if (la !== null) return -1;
      if (lb !== null) return 1;
      return a.id.localeCompare(b.id);
    });
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const A = sorted[i], B = sorted[j];
        const rel = orderOf(A.time, B.time);
        if (rel === "a_before_b") { edges.push({ from: A.id, to: B.id, kind: "directed", reason: "B's reliable time follows A's beyond tolerance + skew" }); bump(outDeg, A.id); bump(inDeg, B.id); }
        else if (rel === "b_before_a") { edges.push({ from: B.id, to: A.id, kind: "directed", reason: "A's reliable time follows B's beyond tolerance + skew" }); bump(outDeg, B.id); bump(inDeg, A.id); }
        else { edges.push({ from: A.id, to: B.id, kind: "order_not_established", reason: "endpoints not both T2+ or gap within tolerance/skew — related but unordered" }); }
      }
      // Coverage cap conditions.
      if (usableLowerBound(sorted[i].time) === null) { coverageCapped = true; coverageReasons.push(`${sorted[i].entity}: no T2+ time (${sorted[i].time?.tier ?? "none"})`); }
      if (sorted[i].hasArchiveCoverageBeforeStart === false) { coverageCapped = true; coverageReasons.push(`${sorted[i].entity}: no archive coverage before path start`); }
    }
  }

  const languagesByClaim = new Map<string, Set<string>>();
  for (const inst of instances) { const s = languagesByClaim.get(inst.claimId) || new Set(); if (inst.language) s.add(inst.language); languagesByClaim.set(inst.claimId, s); }

  const nodes: PathNode[] = instances.map((inst) => {
    const od = outDeg.get(inst.id) || 0, idg = inDeg.get(inst.id) || 0;
    let role: PathRole;
    if (od === 0 && idg === 0) role = "isolated";
    else if (idg === 0) role = "earliest_observed";
    else if (od === 0) role = "terminal";
    else role = "amplifier";
    if (role === "amplifier" && inst.language && (languagesByClaim.get(inst.claimId)?.size || 0) > 1) role = "cross_language_bridge";
    return { id: inst.id, claimId: inst.claimId, entity: inst.entity, role, roleAlternative: ROLE_ALTERNATIVE[role], at: inst.time ? new Date(inst.time.at).toISOString() : undefined, tier: inst.time?.tier };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const directedCount = edges.filter((e) => e.kind === "directed").length;
  let confidence: ConfidenceLevel = directedCount > 0 ? "High" : "Unknown";
  let coverageReason: string | undefined;
  if (coverageCapped && confidence !== "Unknown") {
    confidence = COVERAGE_CAP;
    coverageReason = `capped at ${COVERAGE_CAP}: ${[...new Set(coverageReasons)].slice(0, 4).join("; ")}`;
  }

  return { version: PATH_VERSION, nodes, edges, confidence, coverageReason };
}
