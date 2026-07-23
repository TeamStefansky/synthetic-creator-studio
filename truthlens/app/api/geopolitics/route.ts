// Geopolitics + forecast situational picture. Runs the catalog's geopolitics
// sources (UCDP, ReliefWeb, USGS, NASA EONET, Polymarket, Metaculus; ACLED with
// a key) server-side, normalizes to one schema, and returns events + forecasts
// with an honest per-source connection status. Cached briefly for reproducibility.

import { NextRequest, NextResponse } from "next/server";
import { collectGeopolitics } from "@/lib/geopolitics";
import { aggregateGeopolitics } from "@/lib/geopolitics-agg";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 5 * 60_000; // situational feeds update on the order of minutes

export async function GET(_req: NextRequest) {
  const ck = "geopolitics:global";
  const cached = await cacheGet<any>(ck, CACHE_MS);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  try {
    const results = await collectGeopolitics();
    const agg = aggregateGeopolitics(results);
    const out = { ...agg, generatedAt: new Date().toISOString(), cached: false };
    await cacheSet(ck, out);
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Geopolitics scan failed" }, { status: 500 });
  }
}
