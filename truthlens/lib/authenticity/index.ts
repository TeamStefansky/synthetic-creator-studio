// Orchestrator: run every signal whose input data exists, aggregate, band.
// Deterministic, no LLM, no network — a pure function of the collected set.

import { SIGNAL_SPECS, MODEL_VERSION } from "./config";
import { PHASE1_SIGNALS, ALTERNATIVES } from "./signals";
import { aggregate } from "./score";
import type { AuthenticityAssessment, AuthenticityInput, SignalResult } from "./types";

export type { AuthenticityAssessment, AuthenticityInput, AccountProfile, SignalResult, AuthenticityBand } from "./types";
export { MODEL_VERSION } from "./config";

const NOTE =
  "Probabilistic assessment of an ACCOUNT's behavior — never a claim about a person, and never a verdict. " +
  "Signals whose data was not collected are skipped and lower confidence. Review the evidence before acting.";

export function assessAccount(input: AuthenticityInput): AuthenticityAssessment {
  const signals: SignalResult[] = [];
  const missing: string[] = [];

  for (const spec of SIGNAL_SPECS) {
    const fn = PHASE1_SIGNALS[spec.key]; // Phase-2 (provider) signals land next phase
    const out = fn ? fn(input) : null;
    if (!out) {
      missing.push(spec.key);
      signals.push({
        key: spec.key, layer: spec.layer, weight: spec.weight,
        computed: false, alternative: ALTERNATIVES[spec.key] || "",
      });
      continue;
    }
    signals.push({
      key: spec.key, layer: spec.layer, weight: spec.weight,
      computed: true,
      subscore: Math.round(out.subscore * 1000) / 1000,
      contribution: Math.round(out.subscore * spec.weight * 100) / 100,
      evidence: out.evidence,
      alternative: ALTERNATIVES[spec.key] || "",
    });
  }

  const { suspicion_score, confidence, band } = aggregate(signals);
  return {
    account: input.account,
    suspicion_score, confidence, band,
    signals: signals.sort((a, b) => (b.contribution || 0) - (a.contribution || 0)),
    missing_signals: missing,
    assessed_at: new Date().toISOString(),
    model_version: MODEL_VERSION,
    note: NOTE,
  };
}
