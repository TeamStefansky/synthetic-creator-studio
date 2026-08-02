// Media Check (video/audio deepfake & AI-persona analysis) — the pure core.
//
// The Graphika "Pundit by Prompt" gap: their whole investigation is VIDEO/AUDIO
// (recurring AI personas across 154 channels, deepfakes of public figures). This
// module holds the deterministic, testable core: per-frame → overall aggregation,
// a perceptual PERSONA FINGERPRINT, and cross-clip clustering ("the same synthetic
// face keeps appearing"). The vision-model calls live in the API route; frame
// extraction happens in the browser (no server ffmpeg needed, and only media the
// user is authorized to inspect — never a platform download / scrape).
//
// Frozen rules: a headline is a BAND with confidence + an innocent alternative,
// never a verdict; below the frame floor it returns `insufficient` (Unknown);
// public-figure likeness is HEDGED and only for public figures — a private person
// is never identified. No scrapers, no de-anonymization.

import type { ConfidenceLevel } from "@/components/ConfidenceBadge";

export const MEDIA_CHECK_VERSION = "media-check-v1";

// Minimum analyzed frames before an aggregate is trustworthy — fewer → Insufficient
// (a one-frame "verdict" is fabricated precision).
export const MIN_FRAMES = 3;

// Two persona fingerprints within this Hamming distance (of 64 bits) are treated as
// the SAME recurring synthetic face/template for clustering. Conservative by design.
export const PERSONA_HAMMING_THRESHOLD = 10;

export interface FrameScore {
  /** 0–100 likelihood the frame is AI-generated / synthetic. */
  aiGenerated: number;
  /** 0–100 likelihood the frame is a face-swap / impersonation deepfake (optional). */
  deepfake?: number;
}

export interface MediaAssessment {
  available: boolean;
  version: string;
  mediaType: "video" | "audio" | "image";
  frames: number;
  aiGeneratedLikelihood: number; // 0–100 aggregate
  deepfakeLikelihood: number; // 0–100 aggregate
  confidence: ConfidenceLevel;
  insufficient: boolean;
  /** Hedged, public-figures-only ("appears to depict…"); never a private individual. */
  publicFigure?: string;
  manipulationTechniques: string[];
  /** Perceptual hash for clustering the same synthetic persona across clips. */
  personaFingerprint?: string;
  alternative: string;
  evidence: string[];
  note?: string;
}

// ---------------------------------------------------------------------------
// Perceptual persona fingerprint (average-hash over an 8×8 grayscale sample)
// ---------------------------------------------------------------------------

/**
 * Average-hash a downscaled 8×8 grayscale sample (64 values, 0–255) into a 16-hex
 * (64-bit) fingerprint: each bit is 1 when the pixel is above the sample mean.
 * Deterministic and robust to re-encoding/scaling — so the same synthetic face
 * yields a near-identical hash across clips. Returns "" for a malformed sample.
 */
export function perceptualHash(gray: number[]): string {
  if (!Array.isArray(gray) || gray.length !== 64) return "";
  const mean = gray.reduce((a, b) => a + b, 0) / 64;
  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let v = 0;
    for (let bit = 0; bit < 4; bit++) {
      v = (v << 1) | (gray[nibble * 4 + bit] > mean ? 1 : 0);
    }
    hex += v.toString(16);
  }
  return hex;
}

const HEX_BITS: Record<string, number> = {
  "0": 0, "1": 1, "2": 1, "3": 2, "4": 1, "5": 2, "6": 2, "7": 3,
  "8": 1, "9": 2, a: 2, b: 3, c: 2, d: 3, e: 3, f: 4,
};

/** Hamming distance between two equal-length hex fingerprints (bit differences). */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length || !a) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    d += HEX_BITS[x.toString(16)] ?? 0;
  }
  return d;
}

export interface PersonaItem {
  id: string;
  fingerprint: string;
}
export interface PersonaCluster {
  members: string[];
  representative: string; // fingerprint of the first member
}

/**
 * Cluster clips by persona fingerprint (union-find on Hamming ≤ threshold). Two
 * clips in one cluster carry the SAME recurring synthetic face/template — the
 * Graphika "persona across N channels" signal. Deterministic; order-independent.
 */
export function clusterPersonas(items: PersonaItem[], threshold = PERSONA_HAMMING_THRESHOLD): PersonaCluster[] {
  const valid = items.filter((it) => it.fingerprint && it.fingerprint.length === 16);
  const parent = valid.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (hammingHex(valid[i].fingerprint, valid[j].fingerprint) <= threshold) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < valid.length; i++) {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(i);
  }
  return [...groups.values()].map((idxs) => ({
    members: idxs.map((i) => valid[i].id),
    representative: valid[idxs[0]].fingerprint,
  }));
}

// ---------------------------------------------------------------------------
// Per-frame → overall aggregation
// ---------------------------------------------------------------------------

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Aggregate per-frame scores into an overall AI/deepfake likelihood + a confidence
 * band. Confidence rises with more frames AND tighter agreement (low spread); below
 * MIN_FRAMES it is `insufficient` (Unknown) — never a confident number from one frame.
 */
export function aggregateFrameScores(frames: FrameScore[]): {
  aiGeneratedLikelihood: number;
  deepfakeLikelihood: number;
  confidence: ConfidenceLevel;
  insufficient: boolean;
  frames: number;
} {
  const n = frames.length;
  if (n < MIN_FRAMES) {
    return { aiGeneratedLikelihood: 0, deepfakeLikelihood: 0, confidence: "Unknown", insufficient: true, frames: n };
  }
  const ai = frames.map((f) => f.aiGenerated);
  const df = frames.map((f) => f.deepfake ?? 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs: number[], m: number) => Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  const aiMean = mean(ai);
  const spread = sd(ai, aiMean);
  // High agreement (spread<15) + >=6 frames → High; moderate → Medium; else Low.
  let confidence: ConfidenceLevel = "Low";
  if (n >= 6 && spread < 15) confidence = "High";
  else if (n >= MIN_FRAMES && spread < 25) confidence = "Medium";
  return {
    aiGeneratedLikelihood: clamp(aiMean),
    deepfakeLikelihood: clamp(mean(df)),
    confidence,
    insufficient: false,
    frames: n,
  };
}

/** Convenience: build a full MediaAssessment from aggregated frame scores + LLM extras. */
export function buildAssessment(
  frames: FrameScore[],
  extras: {
    mediaType?: MediaAssessment["mediaType"];
    publicFigure?: string;
    manipulationTechniques?: string[];
    personaFingerprint?: string;
    evidence?: string[];
  } = {},
): MediaAssessment {
  const agg = aggregateFrameScores(frames);
  return {
    available: true,
    version: MEDIA_CHECK_VERSION,
    mediaType: extras.mediaType ?? "video",
    frames: agg.frames,
    aiGeneratedLikelihood: agg.aiGeneratedLikelihood,
    deepfakeLikelihood: agg.deepfakeLikelihood,
    confidence: agg.confidence,
    insufficient: agg.insufficient,
    publicFigure: extras.publicFigure,
    manipulationTechniques: extras.manipulationTechniques ?? [],
    personaFingerprint: extras.personaFingerprint,
    alternative:
      "AI-generation cues can also come from ordinary post-production, heavy compression, stock/stylized footage, or a legitimately labeled synthetic-media production — a high score is a lead to verify, not proof of a deceptive deepfake.",
    evidence: extras.evidence ?? [],
    note: agg.insufficient
      ? `Only ${agg.frames} frame(s) analyzed — need ≥ ${MIN_FRAMES} for an aggregate assessment.`
      : undefined,
  };
}
