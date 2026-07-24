// Link Board API - calibrated domain/infrastructure overlap comparison.
// POST { domains: string[] } -> BoardResult (matrix + evidenced edges).
// Read-and-report only (CLAUDE.md rule 6): no action against any domain.

import { NextRequest, NextResponse } from "next/server";
import { runBoard } from "@/lib/board/links";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw: unknown = body?.domains;
    const domains = Array.isArray(raw)
      ? raw.filter((d): d is string => typeof d === "string")
      : typeof raw === "string"
        ? String(raw).split(/[\s,]+/)
        : [];
    const clean = domains.map((d) => d.trim()).filter(Boolean);
    if (clean.length < 2) {
      return NextResponse.json({ error: "Provide at least two domains to compare." }, { status: 400, headers: NO_STORE });
    }
    const result = await runBoard(clean);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "comparison failed" }, { status: 500, headers: NO_STORE });
  }
}
