// OSINT research API - POST { query } → the orchestrator classifies it, collects
// from every live source (crt.sh, homepage trackers + reverse-lookup pivots,
// documented host conduct, curated-watchlist match), and compiles the 14-section
// report. Passive/open-source only; not-connected sources disclosed honestly.

import { NextRequest, NextResponse } from "next/server";
import { runResearch } from "@/lib/osint/research";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    if (query.length < 3) return NextResponse.json({ error: "query must be at least 3 characters" }, { status: 400, headers: NO_STORE });
    const date = new Date().toISOString().slice(0, 10);
    const runId = `run-${Date.now().toString(36)}`;
    const { findings, report } = await runResearch(query, { date, runId });
    return NextResponse.json({ query, findings: { kind: findings.kind, value: findings.value, log: findings.log, toolsLive: findings.toolsLive, toolsNotConfigured: findings.toolsNotConfigured, watchlist: findings.watchlist?.cluster || null }, report }, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "research failed" }, { status: 500, headers: NO_STORE });
  }
}
