// Log-analysis endpoint. Accepts log text the USER is authorized to inspect.

import { NextRequest, NextResponse } from "next/server";
import { analyzeLog } from "@/lib/log-analyzer";
import { assessCoordination } from "@/lib/coordination";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let text: string;
  try {
    const body = await req.json();
    text = body.log || body.text || "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!text || text.trim().length < 10) {
    return NextResponse.json({ error: "No log content provided." }, { status: 400 });
  }
  // Guardrail against accidental huge uploads.
  if (text.length > 8_000_000) {
    return NextResponse.json({ error: "Log too large (max ~8MB)." }, { status: 413 });
  }

  try {
    const analysis = await analyzeLog(text);
    const coordination = assessCoordination({ log: analysis });
    return NextResponse.json({ analysis, coordination });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Analysis failed" }, { status: 500 });
  }
}
