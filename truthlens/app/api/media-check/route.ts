// Media Check API — analyze browser-extracted video frames for AI/deepfake +
// persona fingerprint. Frames are extracted client-side from media the user is
// authorized to inspect (no server ffmpeg, no platform download). Read-and-report
// only; honest "not connected" without ANTHROPIC_API_KEY.

import { NextRequest, NextResponse } from "next/server";
import { analyzeMediaFrames } from "@/lib/media-vision";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const frames = Array.isArray(body?.frames)
      ? body.frames
          .filter((f: any) => f && typeof f.data === "string" && typeof f.mediaType === "string")
          .slice(0, 8)
      : [];
    const personaSample = Array.isArray(body?.personaSample) ? body.personaSample.map(Number) : undefined;
    // Per-keyframe grayscale samples for the deterministic stability check
    // (8×8 or 32×32 each; capped; malformed rows dropped, never guessed).
    const frameSamples = Array.isArray(body?.frameSamples)
      ? body.frameSamples
          .filter((s: any) => Array.isArray(s) && (s.length === 64 || s.length === 1024))
          .slice(0, 8)
          .map((s: any[]) => s.map(Number))
      : undefined;
    const mediaType = ["video", "audio", "image"].includes(body?.mediaType) ? body.mediaType : "video";
    const result = await analyzeMediaFrames({ frames, mediaType, personaSample, frameSamples });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Media analysis failed" }, { status: 500, headers: NO_STORE });
  }
}
