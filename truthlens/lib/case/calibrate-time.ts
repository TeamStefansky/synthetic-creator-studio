// Time calibration — tolerances and the ordering rule (layer 03 · P1).
// Every number is a named export; nothing inline. Versioned so historical cases
// stay interpretable.

import type { EventTime, TimeTier } from "./types";

export const TIME_RUBRIC_VERSION = "case-time-v1";

// Per-tier tolerance in milliseconds (evidence-handling.md §4).
export const TIER_TOLERANCE_MS: Record<TimeTier, number> = {
  T1: 0,
  T2: 24 * 60 * 60 * 1000,      // ±24h
  T3: 7 * 24 * 60 * 60 * 1000,  // ±7d
  T4: Number.POSITIVE_INFINITY, // observation only — no usable lower bound
};

// Independent clocks disagree; never read an ordering out of a smaller gap.
export const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000; // 60s

// Only T2-or-better counts as a usable lower bound for ordering.
export const ORDERING_MIN_TIER: TimeTier = "T2";
const TIER_RANK: Record<TimeTier, number> = { T1: 4, T2: 3, T3: 2, T4: 1 };

/**
 * The millisecond lower bound a time can support for ordering, or null when it
 * cannot support one — T4 (bound "upper") and self-reported/low tiers return
 * null. This is where the T4 asymmetry is enforced, not in a comment.
 */
export function usableLowerBound(t?: EventTime): number | null {
  if (!t) return null;
  if (t.bound === "upper") return null;                 // T4 / observation-only
  if (TIER_RANK[t.tier] < TIER_RANK[ORDERING_MIN_TIER]) return null; // T3 or worse
  const ms = Date.parse(t.at);
  return Number.isNaN(ms) ? null : ms;
}

export type OrderResult = "a_before_b" | "b_before_a" | "order_not_established";

/**
 * Decide ordering between two event times. Requires both endpoints usable
 * (T2+, not upper-bound) and a gap exceeding both the wider tier tolerance and
 * clock skew. Otherwise `order_not_established` — never a guess.
 */
export function orderOf(a?: EventTime, b?: EventTime): OrderResult {
  const la = usableLowerBound(a);
  const lb = usableLowerBound(b);
  if (la === null || lb === null || !a || !b) return "order_not_established";
  const gap = Math.abs(la - lb);
  const need = Math.max(TIER_TOLERANCE_MS[a.tier], TIER_TOLERANCE_MS[b.tier], CLOCK_SKEW_TOLERANCE_MS);
  if (gap <= need) return "order_not_established";
  return la < lb ? "a_before_b" : "b_before_a";
}
