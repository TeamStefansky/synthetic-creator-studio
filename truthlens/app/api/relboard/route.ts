// Relationship Board - POST/GET a company name, get back a validated org-level
// relationship graph. Grounded via the engine's web search; cached so the same
// company is reproducible within the window and we don't re-spend LLM/search.

import { NextRequest, NextResponse } from "next/server";
import { buildRelBoard } from "@/lib/relboard/engine";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 90; // spec: ~90s request timeout
export const dynamic = "force-dynamic"; // never cache the research result at the edge

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

const CACHE_MS = 30 * 60_000;

async function handle(company: string) {
  const q = company.trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "company must be at least 2 characters" }, { status: 400 });
  }
  // Everything wrapped so the route ALWAYS returns JSON - a thrown error must
  // never surface as a platform HTML/text error page (which the client then
  // fails to JSON.parse).
  try {
    const ck = `relboard:${q.toLowerCase()}`;
    const cached = await cacheGet<any>(ck, CACHE_MS);
    if (cached) return NextResponse.json({ ...cached, cached: true }, { headers: NO_STORE });

    const res = await buildRelBoard(q);
    if (!res.available) {
      return NextResponse.json({ available: false, reason: res.reason }, { status: 200, headers: NO_STORE });
    }
    const out = { available: true, ...res.graph, cached: false };
    await cacheSet(ck, out);
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ available: false, reason: e?.message || "Relationship engine failed" }, { status: 200, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(String(body?.company || ""));
}
export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get("company") || "");
}
