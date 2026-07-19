// CIB analysis endpoint — collects public mentions of an entity and grades a
// Coordination Likelihood with raw evidence. Server-side. Never attributes to a
// state/actor. Short KV cache to respect source rate limits.

import { NextRequest, NextResponse } from "next/server";
import { collectMentions, enrichCreationDates } from "@/lib/narrative/sources";
import { analyzeCib } from "@/lib/cib/analyze";
import { archiveEvidence } from "@/lib/archive";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";
import type { CibReport } from "@/lib/cib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 5 * 60_000;

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  if (entity.length < 2) {
    return NextResponse.json({ error: "entity must be at least 2 characters" }, { status: 400 });
  }
  const key = `cib:${entity.toLowerCase()}`;
  if (storeAvailable()) {
    const cached = await kvGetJson<CibReport>(key);
    if (cached && Date.now() - new Date(cached.generatedAt).getTime() < CACHE_MS) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }
  const results = await collectMentions(entity);
  const mentions = results.flatMap((r) => r.mentions);
  // Enrich account-creation dates (Bluesky) so the creation-clustering signal can
  // graduate above "Not collected" when the data exists. Best-effort, cached.
  await enrichCreationDates(mentions);
  const report = analyzeCib(entity, mentions);
  // Preserve the top evidence URLs (by engagement) before posts change/vanish.
  const topUrls = [...mentions]
    .sort((a, b) => (b.engagement || 0) - (a.engagement || 0))
    .map((m) => m.url);
  report.archives = await archiveEvidence(topUrls);
  const withSources = { ...report, sources: results.map((r) => r.status) };
  if (storeAvailable()) await kvSetJson(key, withSources);
  return NextResponse.json(withSources);
}
