// Sanctions screening API - checks a name/org against public sanctions/watchlists
// via OpenSanctions. Public disclosure only; read-and-report (CLAUDE.md rules 5/6).

import { NextRequest, NextResponse } from "next/server";
import { screenSanctions } from "@/lib/opensanctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  try {
    const result = await screenSanctions(q);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ connected: true, query: q, hits: [], reason: e?.message || "screening failed" }, { status: 500 });
  }
}
