// Planning by expected diagnostic value (layer 05 · P2). The agent does not
// collect breadth-first or what is easiest — it ranks tasks by how much their
// likely results would SEPARATE the current hypotheses, weighted by cost and
// probability of success. Evidence consistent with every hypothesis has zero
// diagnostic value however interesting it looks. This is what separates
// investigation from curation. Pure + deterministic; the plan is journaled
// before collection (loop.ts).

import { predictionsFor } from "../case/predictions";
import type { EvidenceKind, HypothesisKind } from "../case/types";

export const PLAN_VERSION = "agent-plan-v1";

// Discriminating power of a would-be artifact. A class characteristic (ASN,
// registrar) separates nothing and scores 0, no matter how rich it looks.
export const DISCRIMINATION: Partial<Record<EvidenceKind, number>> = {
  ga_id: 1.0, adsense_id: 1.0, ssl_san: 0.9, origin_ip: 0.8, ip: 0.6,
  net_org: 0.5, domain: 0.4, ns: 0.3, mx: 0.3, asn: 0, registrar: 0, archive_first_seen: 0.3,
};
// An archive lookup that lifts an entity T4 -> T2 and thereby establishes an
// ordering is usually the highest-value task available.
export const ORDERING_ENABLER_BASE = 1.2;
export const REVERIFY_BASE = 0.3;

export type TaskKind = "predicted_artifact" | "archive_lookup" | "reverify_hash";

export interface CollectionTask {
  id: string;
  kind: TaskKind;
  target: string;
  expectedArtifact?: EvidenceKind;
  hypothesisId?: HypothesisKind;
  enablesOrdering?: boolean;
  estCost: number;      // 0..1, higher = costlier
  probSuccess: number;  // 0..1
  diagnosticity: number;
  reason: string;
}

function baseFor(t: Pick<CollectionTask, "kind" | "expectedArtifact" | "enablesOrdering">): number {
  if (t.kind === "archive_lookup") return t.enablesOrdering ? ORDERING_ENABLER_BASE : REVERIFY_BASE;
  if (t.kind === "reverify_hash") return REVERIFY_BASE;
  return DISCRIMINATION[t.expectedArtifact as EvidenceKind] ?? REVERIFY_BASE;
}

/** Expected diagnosticity = discrimination × P(success) ÷ (1 + cost). */
export function scoreDiagnosticity(t: Pick<CollectionTask, "kind" | "expectedArtifact" | "enablesOrdering" | "estCost" | "probSuccess">): number {
  const base = baseFor(t);
  return (base * t.probSuccess) / (1 + t.estCost);
}

function reasonFor(base: number, kind: TaskKind, enablesOrdering?: boolean): string {
  if (kind === "archive_lookup" && enablesOrdering) return "archive lookup would lift T4→T2 and establish an ordering — highest available diagnostic value";
  if (base === 0) return "would be consistent with every hypothesis — zero diagnostic value; skip candidate";
  if (base >= 0.8) return "an individualizing artifact that would separate same_operator from the null";
  if (base >= 0.4) return "a distinctive-but-calibrated artifact; partial separation";
  return "low discrimination; informational only";
}

export interface PlanInput {
  liveHypotheses: HypothesisKind[];
  entitiesAtT4: string[];      // archive lookup could establish ordering for these
  unverifiedHashes: string[];  // reverify tasks
  entities: string[];
}

/** Build the ranked collection plan (highest expected diagnosticity first). */
export function planCollection(input: PlanInput): CollectionTask[] {
  const tasks: CollectionTask[] = [];
  let n = 0;
  const push = (t: Omit<CollectionTask, "diagnosticity" | "reason" | "id">) => {
    const diagnosticity = scoreDiagnosticity(t);
    tasks.push({ ...t, id: `task${n++}`, diagnosticity, reason: reasonFor(baseFor(t), t.kind, t.enablesOrdering) });
  };

  for (const h of input.liveHypotheses) {
    for (const p of predictionsFor(h)) {
      for (const target of input.entities) {
        push({ kind: "predicted_artifact", target, expectedArtifact: p.expects, hypothesisId: h, estCost: 0.3, probSuccess: 0.5 });
      }
    }
  }
  for (const e of input.entitiesAtT4) push({ kind: "archive_lookup", target: e, enablesOrdering: true, estCost: 0.2, probSuccess: 0.6 });
  for (const h of input.unverifiedHashes) push({ kind: "reverify_hash", target: h, estCost: 0.1, probSuccess: 0.9 });

  return tasks.sort((a, b) => b.diagnosticity - a.diagnosticity || a.id.localeCompare(b.id));
}
