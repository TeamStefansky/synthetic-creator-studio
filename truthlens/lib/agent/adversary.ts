// The adversarial pass (layer 05 · P4) - mandatory, not optional. Before any
// report, the agent builds the strongest available case AGAINST its own leading
// conclusion using the SAME evidence and the SAME ACH inconsistency scoring. If
// the counter-case is not clearly weaker, the verdict is undetermined and the
// report says "the counter-case was easy to build". Convenient evidence is
// weighted down. Runs on halted/partial runs too, with a separate budget so it is
// never squeezed out. Without it, an autonomous agent plus a fluent model is a
// conspiracy wall at machine speed.

import { ACH_TIE_THRESHOLD, type AchResult } from "../case/hypotheses";
import type { DeceptionAssessment } from "../case/deception";
import type { HypothesisKind } from "../case/types";
import type { Rung } from "../case/lexicon";
import { classifyPublication } from "./authority";

export const ADVERSARY_VERSION = "agent-adversary-v1";
// A dedicated slice so a collection overrun can never squeeze out the pass.
export const ADVERSARY_BUDGET = { llmTokens: 20_000 } as const;

export interface AdversaryResult {
  version: string;
  leading?: HypothesisKind;
  counter?: HypothesisKind;
  leadingInconsistencies: number;
  counterInconsistencies: number;
  counterCaseEasyToBuild: boolean;
  verdict: "leading_holds" | "undetermined";
  loadBearing?: string;   // the single item the conclusion depends on (v2 sensitivity)
  reasons: string[];      // written out in full, stored - a first-class report section
}

export function runAdversary(input: { ach: AchResult; deception: DeceptionAssessment; loadBearing?: string }): AdversaryResult {
  const rows = [...input.ach.rows].sort((a, b) => a.inconsistencies - b.inconsistencies || a.kind.localeCompare(b.kind));
  const leadingRow = input.ach.leading ? rows.find((r) => r.kind === input.ach.leading)! : rows[0];
  const counter = rows.find((r) => r.kind !== leadingRow.kind);

  const reasons: string[] = [];
  const counterInc = counter?.inconsistencies ?? Infinity;
  const easy = counter ? counterInc - leadingRow.inconsistencies <= ACH_TIE_THRESHOLD : false;

  reasons.push(`Strongest counter-case: "${counter?.label ?? "none"}" with ${counterInc} inconsistencies vs the leading ${leadingRow.inconsistencies}.`);
  if (easy) reasons.push("The counter-case was EASY to build - it is not clearly weaker under the same scoring; the verdict is undetermined.");
  if (input.loadBearing) reasons.push(`The leading case depends on a single item: ${input.loadBearing}. Remove it and the case does not hold.`);
  if (input.deception.convenienceWeightDown) reasons.push("EVE: evidence arrived unusually conveniently for the leading hypothesis - weighted DOWN; the deception question is not settled.");
  if (!input.deception.positiveMomPop) reasons.push("Deception lacks positive MOM-POP indicators, so it is carried but cannot itself outrank a simpler hypothesis.");

  return {
    version: ADVERSARY_VERSION,
    leading: leadingRow.kind, counter: counter?.kind,
    leadingInconsistencies: leadingRow.inconsistencies, counterInconsistencies: counterInc,
    counterCaseEasyToBuild: easy,
    verdict: easy ? "undetermined" : "leading_holds",
    loadBearing: input.loadBearing,
    reasons,
  };
}

// ---- Rung gating at publication ----------------------------------------------

export interface GatedStatement { rung: Rung; text: string }
export interface GateResult<T extends GatedStatement> {
  published: T[];
  proposed: { statement: T; reason: string }[];   // common-operation -> review queue
  rejected: { statement: T; reason: string }[];    // attribution -> dropped, logged
}

/** Partition agent statements by the authority ceiling: publish / propose / reject. */
export function gateAgentStatements<T extends GatedStatement>(statements: T[], ceiling: Rung): GateResult<T> {
  const out: GateResult<T> = { published: [], proposed: [], rejected: [] };
  for (const s of statements) {
    const d = classifyPublication(s.rung, ceiling);
    if (d.action === "publish") out.published.push(s);
    else if (d.action === "propose") out.proposed.push({ statement: s, reason: d.reason });
    else out.rejected.push({ statement: s, reason: d.reason });
  }
  return out;
}
