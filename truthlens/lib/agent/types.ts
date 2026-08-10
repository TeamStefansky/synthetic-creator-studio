// THE INVESTIGATOR - agent runtime types (layer 05). The agent is a runtime, not
// a second analyst: it consumes lib/case/* and adds no analytic machinery. All
// limits/ceilings live here and in authority.ts / budget.ts, versioned by
// AGENT_POLICY_VERSION, stamped on every run and report.

import type { Rung } from "../case/lexicon";

export type RunStatus = "active" | "parked" | "halted" | "complete";
export type Coverage = "full" | "partial";

export type StopCondition =
  | "diminishing_diagnosticity" | "stability" | "budget" | "ceiling" | "kill_switch" | "no_progress";

export interface RunInit {
  initiator: string;        // who started it - an unattributed run cannot start
  scope: string;            // workspace scope; never global
  question: string;
  seedEntities: string[];   // the scope-lock contract
  ceiling: Rung;            // authority ceiling in force (displayed, not editable upward)
}

export interface RunRecord {
  id: string;
  policyVersion: string;
  initiator: string;
  scope: string;
  question: string;
  seedEntities: string[];
  ceiling: Rung;
  status: RunStatus;
  coverage: Coverage;
  stopCondition?: StopCondition;
  startedAt: string;
  cycles: number;
}

export interface KillSwitch {
  stopped: () => boolean;
}
