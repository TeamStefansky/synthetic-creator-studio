// Nonprofit / NGO public-registry lookup. Organizations only (no person
// records). Public regulatory filings via official endpoints; cached briefly
// for reproducibility.

import { NextRequest, NextResponse } from "next/server";
import { collectNgo, aggregateNgo } from "@/lib/ngo";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 10 * 60_000;

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 2) {
    return NextResponse.json({ error: "query must be at least 2 characters" }, { status: 400 });
  }
  const ck = `ngo:${query.toLowerCase()}`;
  const cached = await cacheGet<any>(ck, CACHE_MS);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  try {
    const results = await collectNgo(query);
    const agg = aggregateNgo(results);
    const out = { query, ...agg, generatedAt: new Date().toISOString(), cached: false };
    await cacheSet(ck, out);
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "NGO lookup failed" }, { status: 500 });
  }
}
