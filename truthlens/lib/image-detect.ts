// AI-generated / deepfake image detection. Primary provider: Sightengine
// (simple GET). Fallback: Hive. Both are paid; without keys this degrades to
// "unavailable". Probabilistic — indicators, not proof.

import { getJson } from "./http";
import { fetchWithTimeout } from "./http";
import type { MediaResult, ImageVerdict } from "./types";

interface SightengineResp {
  status?: string;
  type?: { ai_generated?: number };
  error?: { message?: string };
}

function labelFor(ai: number, deepfake?: number): string {
  const top = Math.max(ai, deepfake ?? 0);
  if (top >= 70) return "Likely AI-generated / manipulated";
  if (top >= 40) return "Possibly AI-generated";
  return "Likely authentic";
}

async function viaSightengine(url: string): Promise<ImageVerdict | null> {
  const user = process.env.SIGHTENGINE_API_USER;
  const secret = process.env.SIGHTENGINE_API_SECRET;
  if (!user || !secret) return null;
  const api = `https://api.sightengine.com/1.0/check.json?url=${encodeURIComponent(
    url,
  )}&models=genai&api_user=${user}&api_secret=${secret}`;
  const data = await getJson<SightengineResp>(api, { timeoutMs: 15000 });
  if (!data || data.status !== "success" || data.type?.ai_generated == null) return null;
  const ai = Math.round(data.type.ai_generated * 100);
  return { url, aiGeneratedScore: ai, label: labelFor(ai), provider: "sightengine" };
}

async function viaHive(url: string): Promise<ImageVerdict | null> {
  const key = process.env.HIVE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchWithTimeout("https://api.thehive.ai/api/v2/task/sync", {
      method: "POST",
      timeoutMs: 20000,
      headers: { Authorization: `token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    // Hive returns classes; look for an ai-generated / deepfake class score.
    const classes: any[] =
      data?.status?.[0]?.response?.output?.[0]?.classes ||
      data?.output?.[0]?.classes ||
      [];
    const find = (re: RegExp) => classes.find((c) => re.test(String(c.class)))?.score;
    const ai = find(/ai[_-]?generated|genai|synthetic/i);
    const deep = find(/deepfake|face_manip/i);
    if (ai == null && deep == null) return null;
    const aiPct = Math.round((ai ?? 0) * 100);
    const deepPct = deep != null ? Math.round(deep * 100) : undefined;
    return { url, aiGeneratedScore: aiPct, deepfakeScore: deepPct, label: labelFor(aiPct, deepPct), provider: "hive" };
  } catch {
    return null;
  }
}

async function detectOne(url: string): Promise<ImageVerdict | null> {
  return (await viaSightengine(url)) || (await viaHive(url));
}

export async function detectImages(urls: string[]): Promise<MediaResult> {
  const hasKey =
    (process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET) ||
    process.env.HIVE_API_KEY;
  if (!hasKey) {
    return {
      available: false,
      provider: "none",
      images: [],
      note: "Image AI/deepfake detection needs SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET (or HIVE_API_KEY).",
    };
  }
  const targets = Array.from(new Set(urls)).filter((u) => /^https?:\/\//.test(u)).slice(0, 5);
  const results: ImageVerdict[] = [];
  for (const u of targets) {
    const v = await detectOne(u); // sequential — respect provider rate limits
    if (v) results.push(v);
  }
  return {
    available: results.length > 0,
    provider: results[0]?.provider || "sightengine",
    images: results,
    note: results.length ? `Checked ${results.length} image(s).` : "No images could be checked.",
  };
}
