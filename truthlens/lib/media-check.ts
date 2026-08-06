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

export const MEDIA_CHECK_VERSION = "media-check-v2";

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

// ---------------------------------------------------------------------------
// DCT perceptual hash (pHash-style) — v2 fingerprint
// ---------------------------------------------------------------------------

/** Side of the grayscale sample the DCT hash expects (32×32 = 1024 values). */
export const DCT_SAMPLE_SIDE = 32;

/**
 * DCT-based perceptual hash over a 32×32 grayscale sample (1024 values, 0–255):
 * 2D DCT-II → keep the 8×8 low-frequency block → threshold the 63 AC
 * coefficients on their median (DC bit is 0). 16-hex / 64-bit output,
 * comparable with hammingHex/clusterPersonas exactly like the v1 aHash.
 *
 * Why it beats the aHash: the low-frequency spectrum survives crops, scaling,
 * re-encoding and brightness/contrast changes that flip many aHash bits —
 * uniform brightness shifts move only the DC term and contrast scaling
 * preserves every median comparison, so the hash is invariant to both by
 * construction. Returns "" for a malformed sample.
 */
export function dctHash(gray: number[]): string {
  const N = DCT_SAMPLE_SIDE;
  if (!Array.isArray(gray) || gray.length !== N * N || gray.some((v) => !isFinite(v))) return "";
  // Precompute the cosine basis for the 8 low frequencies (cos((2x+1)uπ/2N)).
  const K = 8;
  const cos: number[][] = [];
  for (let u = 0; u < K; u++) {
    cos[u] = [];
    for (let x = 0; x < N; x++) cos[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  }
  // Separable 2D DCT-II restricted to the top-left K×K block.
  // rows: R[u][y] = Σ_x g(x,y)·cos_u(x)   then F[u][v] = Σ_y R[u][y]·cos_v(y)
  const coef: number[] = new Array(K * K).fill(0);
  for (let u = 0; u < K; u++) {
    const row: number[] = new Array(N).fill(0);
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += gray[y * N + x] * cos[u][x];
      row[y] = s;
    }
    for (let v = 0; v < K; v++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += row[y] * cos[v][y];
      coef[u * K + v] = s;
    }
  }
  // Median of the 63 AC coefficients (DC excluded — it is pure brightness).
  const ac = coef.slice(1).slice().sort((a, b) => a - b);
  const median = (ac[30] + ac[31]) / 2; // 63 values → average the middle pair
  // Comparison epsilon scaled to the spectrum: floating-point noise around
  // near-zero coefficients must never flip a bit (it would silently break the
  // brightness/contrast invariance the hash is chosen for). Real structure
  // separates from the median by orders of magnitude more than this.
  const eps = 1e-6 * (1 + Math.abs(ac[62]) + Math.abs(ac[0]));
  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let v = 0;
    for (let bit = 0; bit < 4; bit++) {
      const i = nibble * 4 + bit;
      v = (v << 1) | (i === 0 ? 0 : coef[i] > median + eps ? 1 : 0);
    }
    hex += v.toString(16);
  }
  return hex;
}

/** One dispatcher for both fingerprint generations: a 1024-value (32×32)
 * sample → DCT hash (v2); a 64-value (8×8) sample → average hash (v1, kept so
 * previously stored fingerprints stay comparable). Anything else → "". */
export function fingerprintOf(sample: number[]): string {
  if (!Array.isArray(sample)) return "";
  if (sample.length === DCT_SAMPLE_SIDE * DCT_SAMPLE_SIDE) return dctHash(sample);
  if (sample.length === 64) return perceptualHash(sample);
  return "";
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
// Temporal consistency (frame-to-frame fingerprint stability)
// ---------------------------------------------------------------------------

/** A shot whose consecutive-frame hash distances have a median at or below
 * this is treated as CONTINUOUS (same scene) — the baseline a spike needs. */
export const TEMPORAL_STABLE_MEDIAN = 12;
/** A consecutive-frame distance at or above this, inside a continuous shot,
 * is a spike — the "face flickers between frames" swap signature. */
export const TEMPORAL_SPIKE_DISTANCE = 20;
/** Fewer frames than this → null (no aggregate from too little data). */
export const TEMPORAL_MIN_FRAMES = 3;

export interface TemporalConsistency {
  /** Hamming distances between consecutive frame fingerprints. */
  distances: number[];
  median: number;
  /** Distances ≥ TEMPORAL_SPIKE_DISTANCE while the shot is otherwise stable. */
  spikes: number;
  /** True when an otherwise-continuous shot contains isolated jumps. */
  unstable: boolean;
  /** Honest description INCLUDING the innocent alternative (hard scene cuts). */
  note: string;
}

/**
 * Frame-to-frame stability of perceptual fingerprints. A genuine continuous
 * shot drifts smoothly (small distances); a face-swap that momentarily fails
 * produces isolated large jumps inside an otherwise stable sequence. A video
 * with a HIGH median is simply an edit with scene cuts — that is NOT flagged
 * (the spike only means something against a stable baseline). Deterministic,
 * pure; never a verdict on its own.
 */
export function temporalConsistency(hashes: string[]): TemporalConsistency | null {
  const valid = hashes.filter((h) => h && h.length === 16);
  if (valid.length < TEMPORAL_MIN_FRAMES) return null;
  const distances: number[] = [];
  for (let i = 1; i < valid.length; i++) distances.push(hammingHex(valid[i - 1], valid[i]));
  const sorted = [...distances].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const stable = median <= TEMPORAL_STABLE_MEDIAN;
  const spikes = stable ? distances.filter((d) => d >= TEMPORAL_SPIKE_DISTANCE).length : 0;
  const unstable = stable && spikes >= 1;
  return {
    distances,
    median,
    spikes,
    unstable,
    note: unstable
      ? `Frame fingerprints jump ${spikes} time(s) inside an otherwise stable shot (median distance ${median}) — a pattern face-swap flicker produces. Could also be a hard scene cut or a flash/transition.`
      : stable
        ? `Frame fingerprints are stable (median distance ${median}) — consistent with a continuous, unspliced shot.`
        : `Frame fingerprints vary throughout (median distance ${median}) — an edited/multi-scene video; per-frame comparison is uninformative here.`,
  };
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
