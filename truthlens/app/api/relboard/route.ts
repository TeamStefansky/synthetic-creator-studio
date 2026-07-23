// Relationship Board - POST/GET a company name, get back a validated org-level
// relationship graph. Grounded via the engine's web search; cached so the same
// company is reproducible within the window and we don't re-spend LLM/search.

import { NextRequest, NextResponse } from "next/server";
import { buildRelBoard } from "@/lib/relboard/engine";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 90; // spec: ~90s request timeout

const CACHE_MS = 30 * 60_000;

async function handle(company: string) {
  const q = company.trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "company must be at least 2 characters" }, { status: 400 });
  }
  const ck = `relboard:${q.toLowerCase()}`;
  const cached = await cacheGet<any>(ck, CACHE_MS);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const res = await buildRelBoard(q);
  if (!res.available) {
    return NextResponse.json({ available: false, reason: res.reason }, { status: 200 });
  }
  const out = { available: true, ...res.graph, cached: false };
  await cacheSet(ck, out);
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(String(body?.company || ""));
}
export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get("company") || "");
}
