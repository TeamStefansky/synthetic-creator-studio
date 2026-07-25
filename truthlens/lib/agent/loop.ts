// The run loop (layer 05 · P3). Each cycle: check kill switch -> plan -> collect
// within budget -> integrate into the case layer -> recompute -> evaluate the
// stopping rule -> decide. Hypotheses (null + deception + substantive) are formed
// BEFORE deep collection (anchoring is the agent's most likely failure). The
// adversarial pass (P4) and the model are hooked separately; conclusions are
// deterministic given the final ledger — collection ORDER may vary, conclusions
// may not. Collection is injected so the loop is testable without live network.

import { synthesizeCase, type CaseFile } from "../case/synthesize";
import type { StrengthEdge } from "../case/cluster";
import { planCollection, type CollectionTask } from "./plan";
import { evaluateStop, DIAGNOSTICITY_FLOOR } from "./stop";
import { ZERO_SPEND, agentCoverage, MAX_CYCLES, type Spend } from "./budget";
import { startRun, checkpoint, AgentHalted } from "./authority";
import { newJournal, appendJournal, type Journal } from "./journal";
import type { KillSwitch, RunInit, RunRecord } from "./types";
import type { HypothesisKind } from "../case/types";

export const LOOP_VERSION = "agent-loop-v1";
const HYPOTHESES: HypothesisKind[] = ["same_operator", "coincidence_null", "deception"];

export interface CycleResult {
  boardEdges: StrengthEdge[];
  entitiesCollected: number;
  spend: Partial<Spend>;
  remainingDiagnosticity: number;
}
export type Collector = (cycle: number, plan: CollectionTask[], entities: string[]) => CycleResult;

export interface RunDeps {
  collector: Collector;
  kill: KillSwitch;
  now: () => string;
  entitiesPlanned: number;
}

export interface RunResult {
  record: RunRecord;
  caseFile: CaseFile;
  journal: Journal;
  achHistory: string[][];
}

function achRanking(cf: CaseFile): string[] {
  return [...cf.ach.rows].sort((a, b) => a.inconsistencies - b.inconsistencies || a.kind.localeCompare(b.kind)).map((r) => r.kind);
}

export function runInvestigation(init: RunInit, deps: RunDeps): RunResult {
  const t0 = deps.now();
  const record = startRun(init, `run-${init.scope}-${init.seedEntities.join("_").slice(0, 24)}`, t0);
  let journal = newJournal(record.id);
  journal = appendJournal(journal, t0, 0, "hypotheses_formed", "null + deception + same_operator generated before collection (anti-anchoring)");

  const entities = [...init.seedEntities];
  let boardEdges: StrengthEdge[] = [];
  let spend: Spend = { ...ZERO_SPEND };
  let entitiesCollected = 0;
  const achHistory: string[][] = [];
  let noProgressCount = 0;
  let cf = synthesizeCase({ entities, boardEdges, enteredCaseAt: t0 });

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    try { checkpoint(deps.kill); }
    catch (e) {
      if (e instanceof AgentHalted) {
        record.status = "halted"; record.stopCondition = "kill_switch";
        journal = appendJournal(journal, deps.now(), cycle, "stop_eval", "kill switch — halted; retracts nothing");
        break;
      }
      throw e;
    }

    const plan = planCollection({ liveHypotheses: HYPOTHESES, entitiesAtT4: [], unverifiedHashes: [], entities });
    journal = appendJournal(journal, deps.now(), cycle, "plan", `${plan.length} tasks; top ${plan[0]?.diagnosticity.toFixed(2) ?? "0"}`, plan[0]?.diagnosticity);

    const res = deps.collector(cycle, plan, entities);
    const before = boardEdges.length;
    boardEdges = [...boardEdges, ...res.boardEdges];
    spend = {
      externalCalls: spend.externalCalls + (res.spend.externalCalls || 0),
      wallClockMs: spend.wallClockMs + (res.spend.wallClockMs || 0),
      llmTokens: spend.llmTokens + (res.spend.llmTokens || 0),
      cycles: cycle,
      hopDepth: Math.max(spend.hopDepth, res.spend.hopDepth || 0),
    };
    entitiesCollected = Math.max(entitiesCollected, res.entitiesCollected);
    journal = appendJournal(journal, deps.now(), cycle, "collection", `+${res.boardEdges.length} edge(s); remaining ${res.remainingDiagnosticity.toFixed(2)}`, res.remainingDiagnosticity);

    cf = synthesizeCase({ entities, boardEdges, enteredCaseAt: t0 });
    achHistory.push(achRanking(cf));
    journal = appendJournal(journal, deps.now(), cycle, "integration", `clusters ${cf.clusters.filter((c) => c.members.length > 1).length}; leading ${cf.ach.leading ?? "undetermined"}`);

    const newEdges = boardEdges.length - before;
    noProgressCount = newEdges === 0 ? noProgressCount + 1 : 0;
    record.coverage = agentCoverage({ spend, entitiesPlanned: deps.entitiesPlanned, entitiesCollected });

    const stop = evaluateStop({ kill: deps.kill, spend, remainingDiagnosticity: res.remainingDiagnosticity, achHistory, noProgressCount });
    journal = appendJournal(journal, deps.now(), cycle, "stop_eval", stop.stop ? `stop: ${stop.condition}` : "continue");
    if (stop.stop) {
      record.stopCondition = stop.condition;
      record.status = stop.condition === "no_progress" ? "parked" : "complete";
      break;
    }
  }

  record.cycles = achHistory.length;
  if (record.status === "active") { record.status = "complete"; record.stopCondition = record.stopCondition ?? "budget"; }
  return { record, caseFile: cf, journal, achHistory };
}
