// Coverage-safe scheduling + per-run budget (layer 04 · P3). Adaptive cadence:
// a case with a recent material change scans at the floor; a dormant one backs
// off exponentially to the ceiling. Every run has a collection budget; when it is
// exhausted or a collector fails, the run is coverage:partial and the retraction
// guard (diff.ts) forbids it from removing anything. All numbers are named exports.

export const SCHEDULE_VERSION = "case-schedule-v1";
export const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;   // 6h floor
export const MAX_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000; // 14d ceiling
export const BACKOFF_FACTOR = 2;

export const RUN_BUDGET = { maxExternalCalls: 60, maxWallClockMs: 25_000 } as const;

/** Adaptive next interval: material change resets to the floor; else back off. */
export function nextInterval(prevIntervalMs: number | null, hadMaterialChange: boolean): number {
  if (hadMaterialChange || prevIntervalMs == null) return MIN_INTERVAL_MS;
  return Math.min(prevIntervalMs * BACKOFF_FACTOR, MAX_INTERVAL_MS);
}

export interface RunSpend { externalCalls: number; wallClockMs: number }

export function budgetExhausted(spent: RunSpend, budget = RUN_BUDGET): boolean {
  return spent.externalCalls >= budget.maxExternalCalls || spent.wallClockMs >= budget.maxWallClockMs;
}

/**
 * Coverage of a run. Partial if the budget was exhausted, a collector failed, or
 * not every planned entity was collected. Partial coverage disables retraction
 * (see diff.ts) - absence produced by our own budget is not evidence of absence.
 */
export function coverageOf(opts: { spent: RunSpend; budget?: typeof RUN_BUDGET; collectorFailed?: boolean; entitiesPlanned: number; entitiesCollected: number }): "full" | "partial" {
  if (opts.collectorFailed) return "partial";
  if (budgetExhausted(opts.spent, opts.budget)) return "partial";
  if (opts.entitiesCollected < opts.entitiesPlanned) return "partial";
  return "full";
}
