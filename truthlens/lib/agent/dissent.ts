// Standing dissent + conception monitor (layer 06 · P6). The adversarial pass is
// upgraded from a phase into a STANDING function: its budget is reserved and
// cannot be reduced by the main line; it has the authority to force `undetermined`
// (a veto the narrator cannot overrule or soften); it runs on every report
// including halted/partial/no-progress; its output is stored verbatim. The
// conception monitor watches the one failure that matters most - a leading
// hypothesis that has stopped accumulating contradictions.

import type { AdversaryResult } from "./adversary";

export const DISSENT_VERSION = "dissent-v1";
// Reserved - a collection overrun or any run configuration cannot shrink it.
export const DISSENT_RESERVED_BUDGET = { llmTokens: 20_000 } as const;
export const CONCEPTION_FLOOR = 0.1;

export interface DissentResult {
  text: string;            // stored verbatim, rendered in full - truncation is a defect
  forcesUndetermined: boolean;
}

export function reservedDissentBudget(_mainLineOverran: boolean): typeof DISSENT_RESERVED_BUDGET {
  return DISSENT_RESERVED_BUDGET; // always full, regardless of the main line
}

/** Runs on every report (halted/partial included). */
export function runStandingDissent(adv: AdversaryResult): DissentResult {
  return { text: adv.reasons.join("\n"), forcesUndetermined: adv.verdict === "undetermined" };
}

/** The veto. The narrator cannot overrule it - undetermined wins if dissent forces it. */
export function applyDissentVeto(narratorVerdict: "leading_holds" | "undetermined", dissent: DissentResult): "leading_holds" | "undetermined" {
  return dissent.forcesUndetermined ? "undetermined" : narratorVerdict;
}

// ---- Conception monitor ------------------------------------------------------

export function conceptionRatio(inconsistentCount: number, total: number): number {
  return total > 0 ? inconsistentCount / total : 0;
}

export interface ConceptionResult {
  warn: boolean;
  forceRegenerate: boolean; // regenerate the hypothesis set + re-run ACH from scratch
  reason: string;
  ratios: number[];
}

/**
 * Warn when the inconsistent-evidence ratio collapses toward zero while collection
 * volume holds steady - the leading hypothesis has become a filter, not a truth.
 */
export function conceptionMonitor(ratios: number[], volumes: number[]): ConceptionResult {
  const collapsing = ratios.length >= 3 && ratios[ratios.length - 1] < CONCEPTION_FLOOR && ratios[0] > ratios[ratios.length - 1];
  const vmax = Math.max(...volumes, 0);
  const volumeSteady = volumes.length >= 2 && vmax - Math.min(...volumes) <= vmax * 0.5;
  const warn = collapsing && volumeSteady;
  return {
    warn,
    forceRegenerate: warn,
    reason: warn ? "the leading hypothesis has stopped accumulating contradictions while collection held steady - this is a warning about the analysis, not the subject; hypotheses regenerated and ACH re-run from scratch" : "",
    ratios,
  };
}
