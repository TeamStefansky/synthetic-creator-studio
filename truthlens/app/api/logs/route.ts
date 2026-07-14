// Access-log analysis endpoint. Accepts { log: string } (pasted text or the
// contents of an uploaded file) and returns a LogAnalysis. All IP enrichment
// happens server-side. The tool only analyzes text the user supplies.

import { NextRequest, NextResponse } from "next/server";
import { analyzeLog } from "@/lib/log-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guardrail: cap input size so a huge paste can't exhaust memory.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(req: NextRequest) {
  let body: { log?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const log = body.log ?? "";
  if (!log.trim()) {
    return NextResponse.json({ error: "No log content provided" }, { status: 400 });
  }
  if (log.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "Log too large (max 8 MB). Trim it and try again." },
      { status: 413 }
    );
  }

  try {
    const analysis = await analyzeLog(log);
    return NextResponse.json(analysis);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Log analysis failed" },
      { status: 500 }
    );
  }
}
