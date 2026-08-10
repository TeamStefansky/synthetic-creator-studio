// Budget + coverage accounting (layer 05 · P1). Hard per-run limits; reaching any
// marks the run coverage:partial, which (via the monitoring layer) permits adding
// findings and forbids removing them. A budget-truncated run never retracts and
// never regression-alerts - our own incompleteness is not a change in the world.

import { coverageOf } from "../case/schedule";

export const AGENT_BUDGET_VERSION = "agent-budget-v1";

export const MAX_EXTERNAL_CALLS = 80;
export const MAX_WALL_CLOCK_MS = 60_000;
export const MAX_LLM_TOKENS = 120_000;
export const MAX_HOP_DEPTH = 1;   // hops inform the candidate queue only; they never expand scope
export const MAX_CYCLES = 8;

export interface Spend {
  externalCalls: number;
  wallClockMs: number;
  llmTokens: number;
  cycles: number;
  hopDepth: number;
}

export const ZERO_SPEND: Spend = { externalCalls: 0, wallClockMs: 0, llmTokens: 0, cycles: 0, hopDepth: 0 };

/** Which hard limit (if any) has been reached. */
export function overBudget(s: Spend): { over: boolean; which?: string } {
  if (s.externalCalls >= MAX_EXTERNAL_CALLS) return { over: true, which: "external_calls" };
  if (s.wallClockMs >= MAX_WALL_CLOCK_MS) return { over: true, which: "wall_clock" };
  if (s.llmTokens >= MAX_LLM_TOKENS) return { over: true, which: "llm_tokens" };
  if (s.cycles >= MAX_CYCLES) return { over: true, which: "cycles" };
  if (s.hopDepth > MAX_HOP_DEPTH) return { over: true, which: "hop_depth" };
  return { over: false };
}

/** Run coverage, reusing the case scheduler's rule plus the agent-only limits. */
export function agentCoverage(opts: { spend: Spend; entitiesPlanned: number; entitiesCollected: number; collectorFailed?: boolean }): "full" | "partial" {
  if (overBudget(opts.spend).over) return "partial";
  return coverageOf({
    spent: { externalCalls: opts.spend.externalCalls, wallClockMs: opts.spend.wallClockMs },
    collectorFailed: opts.collectorFailed,
    entitiesPlanned: opts.entitiesPlanned,
    entitiesCollected: opts.entitiesCollected,
  });
}
