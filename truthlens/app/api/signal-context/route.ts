// Attention + tone context for the SIGNAL console (Wikipedia Pageviews +
// GDELT tone - free, keyless, official endpoints). Cached so repeated views
// within a session are reproducible and do not hammer the sources.

import { NextRequest, NextResponse } from "next/server";
import { collectSignalContext } from "@/lib/signal-context";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_MS = 10 * 60_000; // daily-granularity series; 10 min is plenty fresh

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  if (entity.length < 2) {
    return NextResponse.json({ error: "entity must be at least 2 characters" }, { status: 400 });
  }
  const ck = `signal-context:${entity.toLowerCase()}`;
  const cached = await cacheGet<any>(ck, CACHE_MS);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const out = await collectSignalContext(entity);
  await cacheSet(ck, out);
  return NextResponse.json({ ...out, cached: false });
}
