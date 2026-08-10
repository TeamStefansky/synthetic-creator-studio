// Case report API - receives the searches linked to a case (from the browser's
// local case store) and returns the assembled summary report. The report is
// built deterministically from the collected data; the BLUF is optionally
// polished by the LLM (honest fallback without a key). Read-and-report only.

import { NextRequest, NextResponse } from "next/server";
import { buildDossier, type DossierCheck } from "@/lib/casebook/dossier";
import { narrateReport } from "@/lib/casebook/narrate";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const caseId = String(body?.caseId || "");
    const name = String(body?.name || "Untitled case");
    const subject = typeof body?.subject === "string" ? body.subject : "";
    const rawChecks = Array.isArray(body?.checks) ? body.checks : [];
    const checks: DossierCheck[] = rawChecks
      .filter((c: any) => c && typeof c.id === "string" && typeof c.type === "string")
      .slice(0, 200)
      .map((c: any) => ({
        id: String(c.id), type: String(c.type), input: String(c.input || ""),
        headline: String(c.headline || c.input || ""), level: c.level ? String(c.level) : undefined,
        result: c.result, createdAt: String(c.createdAt || ""),
      }));

    const report = buildDossier({ caseId, name, subject, checks, generatedAt: new Date().toISOString() });
    const narration = await narrateReport(report);
    return NextResponse.json({ report: { ...report, bluf: narration.bluf }, narration: { source: narration.source, reason: narration.reason } }, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Report generation failed" }, { status: 500, headers: NO_STORE });
  }
}
