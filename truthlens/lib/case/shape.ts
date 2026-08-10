// Case shape hash (layer 04 · P1). The first and cheapest monitoring gate. It
// hashes CONCLUSIONS ONLY - cluster membership + bounded confidence, articulation
// edges, established path directions, the order-not-established pair set, the
// hypothesis ranking + verdict, the rung, and coverage status. It EXCLUDES
// collection timestamps, collector versions, re-observations, and evidence
// ordering, so a run where only crawl times churned produces an identical hash =>
// zero alerts, unconditionally.

import { createHash } from "node:crypto";
import type { CaseFile } from "./synthesize";

export const SHAPE_VERSION = "case-shape-v1";
export type Coverage = "full" | "partial";

export interface CaseShape {
  clusters: { members: string; confidence: string; articulation: string[] }[];
  directedEdges: string[];
  unorderedPairs: string[];
  hypothesisRanking: string[];
  undetermined: boolean;
  leading: string | null;
  rung: string;
  coverage: Coverage;
}

const pair = (a: string, b: string) => [a, b].sort().join("~");

/** The conclusion-only projection of a case (what the shape hash covers). */
export function caseShape(cf: CaseFile, coverage: Coverage = "full"): CaseShape {
  const clusters = cf.clusters
    .filter((c) => c.members.length > 1)
    .map((c) => ({
      members: [...c.members].sort().join("|"),
      confidence: c.confidence,
      articulation: c.articulationEdges.map((e) => pair(e.a, e.b)).sort(),
    }))
    .sort((a, b) => a.members.localeCompare(b.members));

  const directedEdges = cf.path.edges.filter((e) => e.kind === "directed").map((e) => `${e.from}->${e.to}`).sort();
  const unorderedPairs = cf.path.edges.filter((e) => e.kind === "order_not_established").map((e) => pair(e.from, e.to)).sort();
  const hypothesisRanking = [...cf.ach.rows].sort((a, b) => a.inconsistencies - b.inconsistencies || a.kind.localeCompare(b.kind)).map((r) => r.kind);

  return {
    clusters, directedEdges, unorderedPairs, hypothesisRanking,
    undetermined: cf.ach.undetermined, leading: cf.ach.leading ?? null,
    rung: cf.bottomLine.rung, coverage,
  };
}

export function caseShapeHash(cf: CaseFile, coverage: Coverage = "full"): string {
  return createHash("sha256").update(JSON.stringify(caseShape(cf, coverage)), "utf8").digest("hex").slice(0, 32);
}
