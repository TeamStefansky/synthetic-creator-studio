// OSINT tool API (watchlist + report compiler). GET → the installed watchlist
// with honest per-rule tool coverage. POST → compile the 14-section investigation
// report from the provided fields (deterministic; enforces the template
// invariants). Separate from /api/osint (the domain deep-research dossier).

import { NextRequest, NextResponse } from "next/server";
import { getResolvedRules, watchlistDefaults, WATCHLIST_VERSION } from "@/lib/osint/watchlist";
import { compileReport, type ReportInput } from "@/lib/osint/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  return NextResponse.json(
    { version: WATCHLIST_VERSION, defaults: watchlistDefaults(), rules: getResolvedRules() },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ReportInput>;
    const s = (v: unknown, n: number) => (v == null ? undefined : String(v).slice(0, n));
    const input: ReportInput = {
      network_name: String(body.network_name || "").slice(0, 160),
      date: String(body.date || new Date().toISOString().slice(0, 10)),
      run_id: String(body.run_id || `run-${Date.now().toString(36)}`),
      mode: body.mode === "brief" ? "brief" : "full",
      seed: String(body.seed || "").slice(0, 300),
      overall_confidence: (["High", "Moderate", "Low"].includes(String(body.overall_confidence)) ? body.overall_confidence : "Low") as ReportInput["overall_confidence"],
      cluster: String(body.cluster || "").slice(0, 160),
      assessed_actor: String(body.assessed_actor || "Undetermined").slice(0, 160),
      narratives_short: s(body.narratives_short, 200),
      audience_short: s(body.audience_short, 200),
      breakout_category: s(body.breakout_category, 80),
      executive_summary: s(body.executive_summary, 4000),
      scope: s(body.scope, 2000),
      kiq_list: s(body.kiq_list, 2000),
      tools_live: s(body.tools_live, 400),
      tools_not_configured: s(body.tools_not_configured, 400),
      collection_dates: s(body.collection_dates, 120),
      actor_narrative: s(body.actor_narrative, 4000),
      actor_table_rows: s(body.actor_table_rows, 4000),
      asset_table_rows: s(body.asset_table_rows, 8000),
      infrastructure_narrative: s(body.infrastructure_narrative, 4000),
      infra_table_rows: s(body.infra_table_rows, 8000),
      underground_findings_or_none: s(body.underground_findings_or_none, 2000),
      narrative_analysis: s(body.narrative_analysis, 6000),
      disarm_table_rows: s(body.disarm_table_rows, 4000),
      impact_evidence: s(body.impact_evidence, 2000),
      ach_table_rows: s(body.ach_table_rows, 4000),
      playbook_comparison: s(body.playbook_comparison, 3000),
      gaps: s(body.gaps, 3000),
      next_steps: s(body.next_steps, 3000),
      sources_numbered_with_links: s(body.sources_numbered_with_links, 6000),
    };
    if (!input.network_name.trim()) {
      return NextResponse.json({ error: "network_name is required" }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json(compileReport(input), { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "compile failed" }, { status: 500, headers: NO_STORE });
  }
}
