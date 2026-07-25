// Kill switch endpoint (layer 05 · P6). Sets the synchronous stop flag for a run;
// the loop checks it between phases and before every external call. Attributed +
// workspace-scoped. Honest not-connected without a KV store.

import { NextResponse } from "next/server";
import { storeAvailable, kvSetJson } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  let body: any = {}; try { body = await req.json(); } catch { /* handled */ }
  const runId = (body?.runId || "").toString();
  const by = (body?.initiator || req.headers.get("x-initiator") || "").toString();
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  if (!by.trim()) return NextResponse.json({ error: "stop must be attributed" }, { status: 400 });
  if (!storeAvailable()) return NextResponse.json({ connected: false, reason: "run state needs a KV store" }, { headers: { "Cache-Control": "no-store" } });
  try {
    await kvSetJson(`agent:kill:${runId}`, { stopped: true, by, at: new Date().toISOString() });
    return NextResponse.json({ ok: true, runId, stopped: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "stop failed" }, { status: 500 }); }
}
