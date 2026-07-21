// Account-authenticity scoring — types. Produces a PROBABILISTIC assessment of
// an ACCOUNT (never a person): suspicion_score 0–100 + confidence + a fully
// explainable per-signal breakdown. No binary "fake/real" label exists anywhere
// in this module (CLAUDE.md: detector, not judge).

import type { Mention } from "@/lib/narrative/types";

export type SignalLayer = "account" | "engagement" | "audience" | "comment_net" | "temporal";

/** Band keys per the module spec; UI maps them onto the existing risk tokens.
 * "insufficient_data" replaces any risk label when confidence < MIN_CONFIDENCE —
 * a data-poor account must never show a red band. */
export type AuthenticityBand = "authentic" | "low" | "elevated" | "high" | "insufficient_data";

/** Provider-filled account profile (Phase 2). All fields optional — anything the
 * platform API didn't expose stays undefined ("Not collected"). */
export interface AccountProfile {
  platform?: string;
  username?: string;
  followers?: number;
  follows?: number;
  posts?: number;
  createdAt?: string;
  avatarUrl?: string;
  avatarHash?: string;
  bio?: string;
}

export interface SignalResult {
  key: string;
  layer: SignalLayer;
  weight: number;
  /** false → input data unavailable; the signal is SKIPPED (not zeroed) and
   * lowers confidence instead. */
  computed: boolean;
  subscore?: number;     // 0–1 (0 = unremarkable, 1 = highly suspicious)
  contribution?: number; // subscore × weight
  evidence?: Record<string, unknown>;
  /** An innocent explanation for the same observation (CLAUDE.md rule 3). */
  alternative: string;
}

export interface AuthenticityAssessment {
  account: string; // an account handle/id — never a person
  suspicion_score: number; // 0–100
  confidence: number;      // 0–1 = Σ(weight of computed signals)/100
  band: AuthenticityBand;
  signals: SignalResult[];
  missing_signals: string[];
  assessed_at: string;
  model_version: string;
  note: string;
}

export interface AuthenticityInput {
  /** The account being assessed. */
  account: string;
  /** This account's collected mentions. */
  own: Mention[];
  /** The full entity mention set — peer context for benchmarks + co-behavior. */
  all: Mention[];
  /** Precomputed near-duplicate groups (reuse the CIB clustering — one source
   * of truth, no second implementation). */
  clusters?: Mention[][];
  /** Platform account data (Phase 2, provider-gated). null/undefined → the
   * account-layer signals simply don't compute. */
  profile?: AccountProfile | null;
}
