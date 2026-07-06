// Insights Q&A endpoint: answer a question grounded in a finished report.

import { NextRequest, NextResponse } from "next/server";
import { answerReportQuestion } from "@/lib/insights";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const report = body.report as Report | undefined;
  const question = String(body.question || "");
  if (!report || !report.domain) {
    return NextResponse.json({ error: "Missing report" }, { status: 400 });
  }
  const result = await answerReportQuestion(report, question);
  return NextResponse.json(result);
}
