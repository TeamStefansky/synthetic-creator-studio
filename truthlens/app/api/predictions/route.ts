// Prediction markets (Polymarket) for a query/entity - shared by any tool.
// Keyless official read API; cached briefly for reproducibility.

import { NextRequest, NextResponse } from "next/server";
import { searchPredictions } from "@/lib/polymarket";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_MS = 5 * 60_000;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || req.nextUrl.searchParams.get("entity") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "q must be at least 2 characters" }, { status: 400 });
  }
  const ck = `predictions:${q.toLowerCase()}`;
  const cached = await cacheGet<any>(ck, CACHE_MS);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  try {
    const markets = await searchPredictions(q);
    const out = { q, markets, generatedAt: new Date().toISOString() };
    await cacheSet(ck, out);
    return NextResponse.json({ ...out, cached: false });
  } catch (e: any) {
    return NextResponse.json({ q, markets: [], error: e?.message || "prediction lookup failed" }, { status: 200 });
  }
}
