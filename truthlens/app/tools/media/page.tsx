"use client";

// Media Check — upload a video (or audio) you are authorized to inspect. The
// BROWSER extracts evenly-spaced keyframes (<video>+<canvas>) and a small grayscale
// sample for the persona fingerprint, then the server scores AI-generation /
// deepfake and (hedged, public-figures-only) likeness. No platform download/scrape;
// indicators with confidence + an alternative, never a verdict.

import { useState, useRef } from "react";
import { Clapperboard, Loader2, AlertTriangle, Fingerprint } from "lucide-react";
import ToolIntro from "@/components/ToolIntro";
import ConfidenceBadge from "@/components/ConfidenceBadge";

type Assessment = {
  available: boolean;
  mediaType: string;
  frames: number;
  aiGeneratedLikelihood: number;
  deepfakeLikelihood: number;
  confidence: "Low" | "Medium" | "High" | "Unknown";
  insufficient: boolean;
  publicFigure?: string;
  manipulationTechniques: string[];
  personaFingerprint?: string;
  alternative: string;
  evidence: string[];
  note?: string;
};

const SAMPLE_SIDE = 32; // 32×32 grayscale → server-side DCT perceptual hash (v2)

async function extractFrames(
  file: File,
  count = 6,
): Promise<{ frames: { data: string; mediaType: string }[]; personaSample: number[]; frameSamples: number[][] }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.src = url;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Could not read this file as video."));
  });
  const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const canvas = document.createElement("canvas");
  const w = 512;
  const scale = video.videoWidth ? w / video.videoWidth : 1;
  canvas.width = w;
  canvas.height = Math.max(1, Math.round((video.videoHeight || 288) * scale));
  const ctx = canvas.getContext("2d")!;
  // Small canvas for grayscale samples (persona fingerprint + per-frame stability).
  const small = document.createElement("canvas");
  small.width = SAMPLE_SIDE; small.height = SAMPLE_SIDE;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  const graySample = (): number[] => {
    sctx.drawImage(video, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
    const px = sctx.getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE).data;
    const g: number[] = [];
    for (let i = 0; i < SAMPLE_SIDE * SAMPLE_SIDE; i++) {
      g.push(Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]));
    }
    return g;
  };
  const frames: { data: string; mediaType: string }[] = [];
  const frameSamples: number[][] = [];
  const times = dur ? Array.from({ length: count }, (_, i) => (dur * (i + 0.5)) / count) : [0];
  for (const t of times) {
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      video.currentTime = Math.min(t, Math.max(0, dur - 0.05));
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({ data: canvas.toDataURL("image/jpeg", 0.7).split(",")[1], mediaType: "image/jpeg" });
    frameSamples.push(graySample());
  }
  // Persona sample: the middle frame's grayscale (crop/compression-robust DCT
  // hash is computed server-side — one tested hashing path).
  const personaSample = frameSamples[Math.floor(frameSamples.length / 2)] ?? [];
  URL.revokeObjectURL(url);
  return { frames, personaSample, frameSamples };
}

export default function MediaCheckPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Assessment | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async (file: File) => {
    setLoading(true); setError(""); setResult(null); setFileName(file.name);
    try {
      const { frames, personaSample, frameSamples } = await extractFrames(file, 6);
      const r = await fetch("/api/media-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, personaSample, frameSamples, mediaType: "video" }),
      });
      const txt = await r.text();
      let data: any;
      try { data = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || `Analysis failed (${r.status})`); }
      if (!r.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const pct = (n: number) => `${Math.round(n)}/100`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-6 w-6 text-brand-soft" />
        <h1 className="font-display text-2xl font-bold">Media <span className="gradient-text">Check</span></h1>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">
        Upload a video you are authorized to inspect. We sample keyframes in your browser and check for AI-generation, deepfake/impersonation, and (hedged, public figures only) likeness — with a persona fingerprint to spot the same synthetic face across clips.
      </p>

      <div className="card mt-5">
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
          {loading ? "Analyzing…" : "Upload a video"}
        </button>
        {fileName && <span className="ml-3 text-xs text-ink-secondary">{fileName}</span>}
        <p className="mt-2 text-[11px] text-ink-secondary">Only analyze media you own or are authorized to test. Frames are extracted locally in your browser; the file itself is not uploaded — only sampled frames.</p>
      </div>

      {error && <div className="card mt-4 border-risk-high/30 text-sm text-risk-high">{error}</div>}

      {result && (
        <div className="card mt-4 space-y-4">
          {!result.available ? (
            <div className="flex items-start gap-2 text-sm text-risk-unknown">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{result.note}</span>
            </div>
          ) : result.insufficient ? (
            <div className="text-sm text-ink-secondary">{result.note || "Insufficient frames for an aggregate assessment."}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <ConfidenceBadge level={result.confidence} />
                <span className="text-xs text-ink-secondary">{result.frames} frames analyzed</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-bg-elev p-3">
                  <div className="label-muted mb-1">AI-generated likelihood</div>
                  <div className="text-2xl font-bold">{pct(result.aiGeneratedLikelihood)}</div>
                </div>
                <div className="rounded-lg border border-line bg-bg-elev p-3">
                  <div className="label-muted mb-1">Deepfake / impersonation</div>
                  <div className="text-2xl font-bold">{pct(result.deepfakeLikelihood)}</div>
                </div>
              </div>
              {result.publicFigure && (
                <div className="rounded-lg border border-line bg-bg-elev p-3 text-sm">
                  <span className="label-muted">Likeness: </span>{result.publicFigure}
                </div>
              )}
              {result.manipulationTechniques.length > 0 && (
                <div>
                  <div className="label-muted mb-1">Visual artifacts / techniques</div>
                  <ul className="list-disc pl-5 text-sm text-ink-soft">
                    {result.manipulationTechniques.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
              {result.personaFingerprint && (
                <div className="flex items-center gap-2 text-xs text-ink-secondary">
                  <Fingerprint className="h-3.5 w-3.5" />
                  Persona fingerprint: <code className="font-mono text-ink">{result.personaFingerprint}</code>
                  <span className="text-ink-faint">— matches the same synthetic face across clips carrying this hash.</span>
                </div>
              )}
              {result.evidence.length > 0 && <p className="text-sm text-ink-soft">{result.evidence.join(" ")}</p>}
              <p className="border-t border-line pt-3 text-[12px] text-ink-secondary"><span className="font-medium text-ink">Could also be explained by: </span>{result.alternative}</p>
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <ToolIntro
          what={<>Upload a video (or a screen-recording of one). Your browser samples evenly-spaced frames and a small fingerprint, then we score whether the footage looks <span className="text-ink">AI-generated</span> or a <span className="text-ink">face-swap/impersonation deepfake</span>, and flag if it <span className="text-ink">appears to depict a public figure</span> (hedged — public figures only, never a private person). The <span className="text-ink">persona fingerprint</span> lets you spot the same synthetic face reused across many clips.</>}
          steps={[
            <>Press <span className="text-ink">Upload a video</span> and pick a file you are authorized to inspect.</>,
            <>Frames are extracted <span className="text-ink">in your browser</span> and scored server-side.</>,
            <>Read the AI/deepfake likelihood with its confidence — and always its alternative.</>,
          ]}
          note="Needs ANTHROPIC_API_KEY for the vision assessment; without it the tool shows a visible 'not connected' state. It never downloads from a platform — only media you upload."
        />
      </div>
    </div>
  );
}
