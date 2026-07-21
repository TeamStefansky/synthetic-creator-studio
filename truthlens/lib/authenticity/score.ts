// Scoring core: weighted aggregation → suspicion_score, confidence, band.
// score = Σ(subscore × weight); confidence = Σ(weight of computed)/100.
// confidence < MIN_CONFIDENCE → band "insufficient_data" — a data-poor account
// never gets a risk label (module spec §4 + false-positive guardrails §8).

import { BANDS, MIN_CONFIDENCE } from "./config";
import type { AuthenticityBand, SignalResult } from "./types";

export function aggregate(signals: SignalResult[]): {
  suspicion_score: number; confidence: number; band: AuthenticityBand;
} {
  let weighted = 0, computedWeight = 0;
  for (const s of signals) {
    if (!s.computed || s.subscore === undefined) continue;
    weighted += s.subscore * s.weight;
    computedWeight += s.weight;
  }
  const suspicion_score = Math.round(weighted * 10) / 10;
  const confidence = Math.round((computedWeight / 100) * 100) / 100;
  const band: AuthenticityBand =
    confidence < MIN_CONFIDENCE ? "insufficient_data"
      : suspicion_score >= BANDS.high ? "high"
        : suspicion_score >= BANDS.elevated ? "elevated"
          : suspicion_score >= BANDS.low ? "low"
            : "authentic";
  return { suspicion_score, confidence, band };
}
