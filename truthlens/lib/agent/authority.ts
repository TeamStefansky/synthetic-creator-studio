// The cage (layer 05 · P1) — authority, scope lock, kill switch, attributable
// initiation, cross-case separation. Built BEFORE the reasoning loop: an agent
// whose constraints are added afterwards has already run unconstrained. Where the
// rules differ from an analyst-driven case they are STRICTER, never looser.

import { RUNG_RANK, type Rung } from "../case/lexicon";
import { caseEntities, queueCandidate, type Candidate } from "../case/review";
import type { CaseFile } from "../case/synthesize";
import type { EvidenceItem } from "../case/types";
import type { ConfidenceLevel } from "@/components/ConfidenceBadge";
import type { KillSwitch, RunInit, RunRecord } from "./types";

export const AGENT_POLICY_VERSION = "agent-policy-v1";

// The agent is autonomous only to `association`; `common-operation` is a proposal
// requiring analyst approval; `attribution` is unreachable under any input.
export const AGENT_CEILING: Rung = "association";

export type PublishDecision =
  | { action: "publish" }
  | { action: "propose"; queue: "review"; reason: string }
  | { action: "reject"; reason: string };

/**
 * Enforced in code at the point of publication, not in the prompt. A conclusion
 * above the ceiling is a proposal (common-operation) or rejected outright
 * (attribution) — the same visible drop discipline as an uncited sentence.
 */
export function classifyPublication(rung: Rung, ceiling: Rung = AGENT_CEILING): PublishDecision {
  if (rung === "attribution") return { action: "reject", reason: "attribution is human-only and unreachable by the agent" };
  if (RUNG_RANK[rung] <= RUNG_RANK[ceiling]) return { action: "publish" };
  return { action: "propose", queue: "review", reason: `${rung} exceeds the agent ceiling (${ceiling}); queued for analyst approval` };
}

// ---- Scope lock: the agent never adds an entity to a case ---------------------

/** A discovered linked entity ALWAYS goes to the candidate queue, never the case. */
export function agentDiscover(queue: Candidate[], c: Omit<Candidate, "accepted">): Candidate[] {
  return queueCandidate(queue, { ...c, accepted: false });
}

/**
 * The entities the agent actually reasons over = seed + ONLY analyst-accepted
 * candidates. The agent has no path to accept (acceptCandidate is not re-exported
 * here); acceptance is an analyst action.
 */
export function agentCaseEntities(seed: string[], queue: Candidate[]): string[] {
  return caseEntities(seed, queue);
}

// ---- Kill switch: checked between phases and before every external call -------

export class AgentHalted extends Error {
  constructor(msg = "kill switch engaged") { super(msg); this.name = "AgentHalted"; }
}
export function checkpoint(kill: KillSwitch): void {
  if (kill.stopped()) throw new AgentHalted();
}

// ---- Attributable initiation -------------------------------------------------

export function startRun(init: RunInit, id: string, startedAt: string): RunRecord {
  if (!init.initiator || !init.initiator.trim()) throw new Error("unattributed run cannot start");
  if (!init.scope || !init.scope.trim()) throw new Error("a run must be workspace-scoped; global runs are forbidden");
  if (!init.seedEntities?.length) throw new Error("a run needs a seed entity set (the scope-lock contract)");
  return {
    id, policyVersion: AGENT_POLICY_VERSION, initiator: init.initiator, scope: init.scope,
    question: init.question, seedEntities: [...init.seedEntities], ceiling: init.ceiling ?? AGENT_CEILING,
    status: "active", coverage: "full", startedAt, cycles: 0,
  };
}

// ---- No cross-case contamination: evidence may cross, conclusions may not -----

// Branded type: only values passed through asCrossCaseEvidence() are importable.
export type CrossCaseEvidence = EvidenceItem & { readonly __crossCaseEvidence: true };

export function asCrossCaseEvidence(e: EvidenceItem): CrossCaseEvidence {
  // Re-graded independently at the call site; provenance stays intact.
  return e as CrossCaseEvidence;
}

/** Runtime guard backing the type-level rule: a conclusion is never evidence. */
export function assertEvidenceNotConclusion(x: unknown): asserts x is EvidenceItem {
  const o = x as any;
  if (o && (Array.isArray(o.clusters) || o.bottomLine || Array.isArray(o.members) || o.ach)) {
    throw new Error("a conclusion (cluster/case) may never be imported as evidence across cases — circular reinforcement");
  }
  if (!o || !o.kind || !o.entityKey) throw new Error("not an evidence item");
}

// ---- Confidence cannot be raised by re-reasoning -----------------------------

/**
 * Confidence is read straight from the deterministic case computation — never
 * from the model. Re-running the LLM over an unchanged ledger yields the same
 * value because this function never consults the model.
 */
export function agentConfidence(cf: CaseFile): ConfidenceLevel {
  return cf.bottomLine.confidence;
}
