// Media Check — server-side vision analysis of extracted video frames.
//
// Frames are extracted in the BROWSER (<video>+<canvas>) from media the user is
// authorized to inspect and posted here as base64 — no server ffmpeg, no platform
// download/scrape. This runs ONE multi-image vision call (all frames at once) with
// the same model + graceful fallback as Post Check, then aggregates via the tested
// media-check core. Without ANTHROPIC_API_KEY it returns a visible "not connected"
// state — never a faked score.
//
// Frozen rules: output is a BAND with confidence + an innocent alternative, never a
// verdict; public-figure likeness is HEDGED and public-figures-only; a private
// individual is never identified. Below the frame floor → Insufficient (Unknown).

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL, VISION_MODEL, isModelAccessError } from "./llm";
import {
  buildAssessment,
  fingerprintOf,
  temporalConsistency,
  MEDIA_CHECK_VERSION,
  type FrameScore,
  type MediaAssessment,
  type TemporalConsistency,
} from "./media-check";

const MAX_FRAMES = 6;

export interface MediaFrame {
  data: string; // base64 (no data: prefix)
  mediaType: string; // e.g. image/jpeg
}
export interface MediaCheckInput {
  frames: MediaFrame[];
  mediaType?: "video" | "audio" | "image";
  /** Grayscale sample of the dominant frame (browser-computed): 1024 values
   * (32×32 → DCT pHash, v2) or 64 values (8×8 → aHash, v1 back-compat).
   * The server hashes it into the persona fingerprint (one tested path). */
  personaSample?: number[];
  /** Optional per-keyframe grayscale samples (same shapes) — enables the
   * deterministic frame-to-frame stability check (swap-flicker signature). */
  frameSamples?: number[][];
}

const NOT_CONNECTED: MediaAssessment = {
  available: false,
  version: MEDIA_CHECK_VERSION,
  mediaType: "video",
  frames: 0,
  aiGeneratedLikelihood: 0,
  deepfakeLikelihood: 0,
  confidence: "Unknown",
  insufficient: true,
  manipulationTechniques: [],
  alternative: "",
  evidence: [],
  note: "Media analysis needs ANTHROPIC_API_KEY (vision). Frame extraction runs in your browser; the key powers the AI/deepfake assessment.",
};

const SYSTEM = `You are a media-forensics analyst examining still frames sampled from a video the user is authorized to inspect. For EACH frame estimate how likely it is AI-generated/synthetic and, separately, how likely it is a face-swap/impersonation deepfake, from concrete visual artifacts (warped hands/teeth/ears, inconsistent lighting/shadows, unstable backgrounds, blurred face boundaries, impossible text/logos). You MAY note if a frame appears to depict a widely-recognizable PUBLIC figure (celebrity, politician, official, well-known journalist/academic) — hedged ("appears to depict …"); NEVER identify a private or non-public individual (describe them generically as "a person"). Output ONE JSON object only, no prose.`;

/** Analyze extracted frames; returns a full MediaAssessment (or a not-connected one). */
export async function analyzeMediaFrames(input: MediaCheckInput): Promise<MediaAssessment> {
  const key = process.env.ANTHROPIC_API_KEY;
  const frames = (input.frames || []).slice(0, MAX_FRAMES);
  const fp = input.personaSample ? fingerprintOf(input.personaSample) : undefined;
  // Deterministic frame-to-frame stability (runs with or without a key — it is
  // pure computation on the browser-extracted samples, never model output).
  const temporal: TemporalConsistency | null = input.frameSamples?.length
    ? temporalConsistency(input.frameSamples.map(fingerprintOf))
    : null;

  if (!key || frames.length === 0) {
    return {
      ...NOT_CONNECTED,
      personaFingerprint: fp || undefined,
      mediaType: input.mediaType ?? "video",
      evidence: temporal ? [`Deterministic check: ${temporal.note}`] : [],
    };
  }

  const client = new Anthropic({ apiKey: key });
  const params: any = {
    max_tokens: 900,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...frames.map((f) => ({ type: "image", source: { type: "base64", media_type: f.mediaType, data: f.data } })),
          {
            type: "text",
            text: `Score these ${frames.length} frames (in order). Output ONE JSON object:
{
  "frames": [{"aiGenerated": 0-100, "deepfake": 0-100}],  // one per frame, same order
  "publicFigure": "appears to depict <public figure name/role>" or null,
  "manipulationTechniques": ["specific artifact/technique you observed"],
  "notes": "one-line summary of the visual evidence"
}`,
          },
        ],
      },
    ],
  };

  const candidates = [...new Set([VISION_MODEL, LLM_MODEL])];
  let raw = "";
  for (let i = 0; i < candidates.length; i++) {
    try {
      const msg = await client.messages.create({ model: candidates[i], ...params });
      raw = (msg.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      break;
    } catch (e: any) {
      if (i < candidates.length - 1 && isModelAccessError(String(e?.message || ""))) continue;
      return { ...NOT_CONNECTED, personaFingerprint: fp, mediaType: input.mediaType ?? "video", note: "Vision analysis failed — check the ANTHROPIC_API_KEY value / model access." };
    }
  }

  let parsed: any = {};
  try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { /* fall through */ }

  const perFrame: FrameScore[] = Array.isArray(parsed.frames)
    ? parsed.frames.map((f: any) => ({
        aiGenerated: Number(f?.aiGenerated) || 0,
        deepfake: f?.deepfake != null ? Number(f.deepfake) || 0 : undefined,
      }))
    : [];
  // If the model didn't return per-frame rows, treat each submitted frame as unscored
  // rather than fabricating — buildAssessment will mark Insufficient.
  const techniques = Array.isArray(parsed.manipulationTechniques)
    ? parsed.manipulationTechniques.map(String).slice(0, 8)
    : [];
  const pubFig = typeof parsed.publicFigure === "string" && parsed.publicFigure.trim() ? parsed.publicFigure.trim().slice(0, 160) : undefined;
  const evidence = typeof parsed.notes === "string" && parsed.notes.trim() ? [parsed.notes.trim().slice(0, 300)] : [];
  // Surface the deterministic stability finding as EVIDENCE with its innocent
  // alternative baked in — it contextualizes the model's scores, never inflates them.
  if (temporal) evidence.push(`Deterministic check: ${temporal.note}`);

  return buildAssessment(perFrame, {
    mediaType: input.mediaType ?? "video",
    publicFigure: pubFig,
    manipulationTechniques: techniques,
    personaFingerprint: fp,
    evidence,
  });
}
