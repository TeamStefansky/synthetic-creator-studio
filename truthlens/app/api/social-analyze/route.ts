// Social Analyze endpoint — profile-seeded influence-op detection. Server-side
// only. Short KV cache to respect source rate limits; a report for a given day
// is reproducible (all collectors cache per day underneath).

import { NextRequest, NextResponse } from "next/server";
import { runSocialAnalyze } from "@/lib/social-analyze/orchestrate";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";
import type { SocialAnalyzeReport } from "@/lib/social-analyze/orchestrate";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 5 * 60_000;

export async function GET(req: NextRequest) {
  const profile = (req.nextUrl.searchParams.get("profile") || "").trim();
  if (profile.length < 2) {
    return NextResponse.json({ error: "profile must be a profile link or @handle" }, { status: 400 });
  }
  const key = `sa:${profile.toLowerCase()}`;
  if (storeAvailable()) {
    const cached = await kvGetJson<SocialAnalyzeReport>(key);
    if (cached && Date.now() - new Date(cached.generatedAt).getTime() < CACHE_MS) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }
  const report = await runSocialAnalyze(profile);
  if ("error" in report) return NextResponse.json(report, { status: 400 });
  if (storeAvailable()) await kvSetJson(key, report);
  return NextResponse.json(report);
}
