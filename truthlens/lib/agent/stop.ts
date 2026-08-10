// Stopping rule (layer 05 · P3). The agent stops when any condition fires and the
// report names WHICH. Diminishing diagnosticity is the principled, common stop -
// an agent that always finds something is worthless. All thresholds are named.

import { overBudget, type Spend } from "./budget";
import type { KillSwitch, StopCondition } from "./types";

export const STOP_VERSION = "agent-stop-v1";
export const DIAGNOSTICITY_FLOOR = 0.15;  // below this, remaining tasks would not move the answer
export const STABLE_CYCLES = 2;           // ACH ranking unchanged this many cycles => stop
export const NO_PROGRESS_CYCLES = 3;      // scheduled runs with no new diagnostic evidence => park

export interface StopInput {
  kill: KillSwitch;
  spend: Spend;
  remainingDiagnosticity: number;   // highest expected diagnosticity still available
  achHistory: string[][];           // ACH ranking (hypothesis kinds) per cycle
  noProgressCount: number;
  atCeiling?: boolean;              // conclusion reached the agent's ceiling; more work only supports a higher rung
}

function achStable(history: string[][]): boolean {
  if (history.length < STABLE_CYCLES) return false;
  const tail = history.slice(-STABLE_CYCLES).map((r) => r.join(">"));
  return tail.every((r) => r === tail[0]);
}

export function evaluateStop(s: StopInput): { stop: boolean; condition?: StopCondition } {
  if (s.kill.stopped()) return { stop: true, condition: "kill_switch" };
  if (overBudget(s.spend).over) return { stop: true, condition: "budget" };
  if (s.noProgressCount >= NO_PROGRESS_CYCLES) return { stop: true, condition: "no_progress" };
  if (s.atCeiling) return { stop: true, condition: "ceiling" };
  if (s.remainingDiagnosticity < DIAGNOSTICITY_FLOOR) return { stop: true, condition: "diminishing_diagnosticity" };
  if (achStable(s.achHistory)) return { stop: true, condition: "stability" };
  return { stop: false };
}
