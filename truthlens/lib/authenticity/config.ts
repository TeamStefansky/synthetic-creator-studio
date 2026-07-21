// Authenticity module configuration — ALL weights, thresholds, and benchmarks
// live here, never inside signal logic, so they are tunable per platform /
// vertical without code changes (module spec §7). Weights sum to 100.

import type { SignalLayer } from "./types";

export const MODEL_VERSION = "authenticity-v1";

export interface SignalSpec {
  key: string;
  layer: SignalLayer;
  weight: number;
  /** 1 = computable from the mention stream alone; 2 = needs the platform provider. */
  phase: 1 | 2;
}

/** The 18-signal catalog (spec §3) — keys, layers, and weights mirrored exactly. */
export const SIGNAL_SPECS: SignalSpec[] = [
  // Layer A — account (20)
  { key: "follower_following_ratio", layer: "account", weight: 5, phase: 2 },
  { key: "growth_velocity", layer: "account", weight: 5, phase: 2 },
  { key: "profile_image_flags", layer: "account", weight: 4, phase: 2 },
  { key: "username_pattern", layer: "account", weight: 3, phase: 2 },
  { key: "post_to_follower_ratio", layer: "account", weight: 3, phase: 2 },
  // Layer B — engagement (25)
  { key: "engagement_rate_deviation", layer: "engagement", weight: 8, phase: 1 },
  { key: "engagement_uniformity", layer: "engagement", weight: 6, phase: 1 },
  { key: "like_comment_ratio", layer: "engagement", weight: 5, phase: 1 }, // needs a like/comment split — see signals.ts
  { key: "engagement_velocity", layer: "engagement", weight: 6, phase: 1 },
  // Layer C — audience (25)
  { key: "suspicious_follower_pct", layer: "audience", weight: 10, phase: 2 },
  { key: "geo_language_mismatch", layer: "audience", weight: 8, phase: 1 },
  { key: "follower_botness_recursive", layer: "audience", weight: 7, phase: 2 },
  // Layer D — comment network (20)
  { key: "repeat_commenter_cross_profile", layer: "comment_net", weight: 6, phase: 1 },
  { key: "temporal_clustering", layer: "comment_net", weight: 5, phase: 1 },
  { key: "templated_text", layer: "comment_net", weight: 5, phase: 1 },
  { key: "comment_language_mismatch", layer: "comment_net", weight: 4, phase: 1 },
  // Layer E — temporal (10)
  { key: "always_on_activity", layer: "temporal", weight: 5, phase: 1 },
  { key: "coordinated_posting", layer: "temporal", weight: 5, phase: 1 },
];

/** Band cutoffs: authentic <25 ≤ low <50 ≤ elevated <75 ≤ high. */
export const BANDS = { low: 25, elevated: 50, high: 75 };

/** Below this, no risk label is shown — "insufficient_data" instead. */
export const MIN_CONFIDENCE = 0.4;

/** Engagement-rate benchmarks by follower tier (Phase 2, provider data). */
export const ER_BENCHMARK_BY_TIER = { nano: 0.05, micro: 0.035, macro: 0.018, mega: 0.011 };

// Phase-1 tunables (mention-derived signals)
export const SYNC_WINDOW_MS = 10 * 60_000;      // temporal_clustering: ±10 min peer window
export const COPOST_WINDOW_MS = 5 * 60_000;     // coordinated_posting: ±5 min pair window
export const QUIET_HOURS_NORMAL = 6;            // always_on: a human day has ≥~6 quiet hours
export const MIN_POSTS_ALWAYS_ON = 8;           // and needs enough posts across ≥2 days to judge
