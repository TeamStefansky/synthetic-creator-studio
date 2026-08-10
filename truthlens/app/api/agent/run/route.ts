// THE INVESTIGATOR run endpoint (layer 05 · P5). POST { seedEntities, question,
// initiator } -> runs a bounded investigation over the case machinery and returns
// a situation report. Attributable initiation is required (an unattributed run
// cannot start). Read-only in the world: it only invokes existing collectors.
// The reasoning + conclusions are deterministic; the model (if a key is set) only
// enriches prose downstream.

import { NextResponse } from "next/server";
import { runBoard } from "@/lib/board/links";
import { runInvestigation, type Collector } from "@/lib/agent/loop";
import { runAdversary } from "@/lib/agent/adversary";
import { assessDeception } from "@/lib/case/deception";
import { buildSitrep } from "@/lib/agent/sitrep";
import { buildPremortem } from "@/lib/agent/premortem";
import { runValidation } from "@/lib/agent/validation";
import { AGENT_CEILING } from "@/lib/agent/authority";
import type { StrengthEdge } from "@/lib/case/cluster";
import { isIndividualCharacteristic } from "@/lib/board/calibrate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const seed: string[] = Array.isArray(body?.seedEntities) ? body.seedEntities.filter(Boolean) : [];
  const initiator: string = (body?.initiator || req.headers.get("x-initiator") || "").toString();
  const question: string = (body?.question || "Which of these are connected?").toString();
  // Auto-insights derived by the browser from the analyst's own searches.
  const insights: string[] = Array.isArray(body?.insights) ? body.insights.filter((x: any) => typeof x === "string").slice(0, 20) : [];

  if (seed.length < 2) return NextResponse.json({ error: "Provide at least two seed entities." }, { status: 400 });
  if (!initiator.trim()) return NextResponse.json({ error: "An attributed run requires an initiator." }, { status: 400 });

  try {
    // Single authorized collection pass over the seed set (read-only).
    const board = await runBoard(seed);
    const edges: StrengthEdge[] = board.edges
      .filter((e) => e.strength !== "Unknown")
      .map((e) => ({
        a: e.a, b: e.b, strength: e.strength, evidenceId: `${e.a}:${e.b}`, reason: e.top?.display,
        characteristic: e.top ? (isIndividualCharacteristic(e.top.kind) ? "individual" as const : "class" as const) : undefined,
      }));

    const collector: Collector = (cycle) =>
      cycle === 1
        ? { boardEdges: edges, entitiesCollected: board.entities.length, spend: { externalCalls: board.entities.length }, remainingDiagnosticity: 0.05 }
        : { boardEdges: [], entitiesCollected: board.entities.length, spend: {}, remainingDiagnosticity: 0 };

    const run = runInvestigation(
      { initiator, scope: initiator, question, seedEntities: board.entities, ceiling: AGENT_CEILING },
      { collector, kill: { stopped: () => false }, now: () => new Date().toISOString(), entitiesPlanned: board.entities.length },
    );

    const loadBearing = run.caseFile.clusters.find((c) => c.dependsOn)?.dependsOn?.why;
    const adversary = runAdversary({ ach: run.caseFile.ach, deception: assessDeception({}), loadBearing });
    const validation = runValidation();
    const premortem = buildPremortem(run.caseFile).statements.map((s) => `${s.label}: ${s.text}`);

    // External enrichment on the operator thread-end (documented, cited, org-level)
    // is computed inside runBoard and rides on the board result.
    const operatorReputation = board.operatorReputation;

    // infra -> narrative bridge: the investigator autonomously surfaces which seed
    // domains match a documented list or amplify a monitored narrative (computed in
    // runBoard). These become INSIGHTS the analyst never had to paste in.
    const crossInsights = (board.crossLinks?.hits || []).map(
      (h) => `${h.domain} - ${h.detail} [${h.confidence}]${h.citation ? ` (cite: ${h.citation})` : ""}. Could also be: ${h.alternative}`,
    );
    const allInsights = [...insights, ...crossInsights];

    const sitrep = buildSitrep({
      record: run.record, caseFile: run.caseFile, adversary, notPursued: [],
      measuredFpr: validation.falsePositiveRate, fixtureSuiteVersion: validation.fixtureSuiteVersion, premortem,
      insights: allInsights, operatorReputation,
    });

    return NextResponse.json(
      { record: run.record, sitrep, network: board.network, journal: run.journal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "run failed" }, { status: 500 });
  }
}
