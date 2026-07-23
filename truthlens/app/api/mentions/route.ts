// Brand Mentions - "where does my brand appear?". Reuses the narrative source
// layer (collectMentions) and returns a de-duplicated, most-recent-first list
// plus a by-source and by-country geographic breakdown. Public data only; cached
// briefly so repeated views do not hammer the sources (reproducibility).

import { NextRequest, NextResponse } from "next/server";
import { collectMentions } from "@/lib/narrative/sources";
import { aggregateMentions } from "@/lib/mentions-map";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 90_000;

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  if (entity.length < 2) {
    return NextResponse.json({ error: "entity must be at least 2 characters" }, { status: 400 });
  }

  const ck = `mentions:${entity.toLowerCase()}`;
  const cached = await cacheGet<any>(ck, CACHE_MS);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  try {
    const results = await collectMentions(entity);
    const agg = aggregateMentions(results);
    const out = { entity, ...agg, generatedAt: new Date().toISOString(), cached: false };
    await cacheSet(ck, out);
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Mention scan failed" }, { status: 500 });
  }
}
