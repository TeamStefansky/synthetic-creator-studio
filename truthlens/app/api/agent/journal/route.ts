// Journal endpoint (layer 05 · P6). Returns a run's append-only reasoning trace
// for audit/export. Workspace-scoped; honest not-connected without a KV store.
// The journal is subject to the same content rules as the report (no person names).

import { NextResponse } from "next/server";
import { storeAvailable, kvGetJson } from "@/lib/store";
import type { Journal } from "@/lib/agent/journal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId") || "";
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  if (!storeAvailable()) return NextResponse.json({ connected: false, reason: "journals need a KV store" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const journal = await kvGetJson<Journal>(`agent:journal:${runId}`);
    return NextResponse.json({ connected: true, journal: journal ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "journal fetch failed" }, { status: 500 }); }
}
