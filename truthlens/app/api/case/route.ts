// Case Synthesis API (layer 03 · P7). POST { domains } -> runs the existing Link
// Board collection, then composes the deterministic case file (ledger, timeline,
// clusters, path, ACH, gaps). The LLM reconstruction is NOT run here — the wall
// renders the structural case, and narrative reconstruction is a separate,
// key-gated step that degrades to "not connected" honestly.

import { NextResponse } from "next/server";
import { runBoard } from "@/lib/board/links";
import { synthesizeCase } from "@/lib/case/synthesize";
import type { StrengthEdge } from "@/lib/case/cluster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  let domains: string[] = [];
  try { domains = (await req.json())?.domains || []; } catch { /* handled below */ }
  if (!Array.isArray(domains) || domains.filter(Boolean).length < 2) {
    return NextResponse.json({ error: "Provide at least two domains." }, { status: 400 });
  }

  try {
    const board = await runBoard(domains);
    const boardEdges: StrengthEdge[] = board.edges
      .filter((e) => e.strength !== "Unknown")
      .map((e) => ({ a: e.a, b: e.b, strength: e.strength, evidenceId: `${e.a}:${e.b}`, reason: e.top?.display }));

    const caseFile = synthesizeCase({
      entities: board.entities,
      toolOutputs: { board },
      boardEdges,
      emptyAdapters: board.fingerprints.filter((f) => f.errors.length && f.artifactCount === 0).map((f) => `board:${f.entity}`),
    });

    return NextResponse.json(
      { case: caseFile, network: board.network, rubricVersion: board.rubricVersion },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "case synthesis failed" }, { status: 500 });
  }
}
