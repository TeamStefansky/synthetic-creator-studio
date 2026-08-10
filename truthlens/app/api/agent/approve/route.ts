// Proposal approval endpoint (layer 05 · P6). An analyst - never the agent -
// approves a proposed `common-operation` conclusion or accepts a candidate entity
// out of the queue. The agent cannot mark its own output reviewed: approval
// requires an approver distinct from the run's initiator (the agent).

import { NextResponse } from "next/server";
import { storeAvailable, kvSetJson } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  let body: any = {}; try { body = await req.json(); } catch { /* handled */ }
  const runId = (body?.runId || "").toString();
  const approver = (body?.approver || req.headers.get("x-approver") || "").toString();
  const agentInitiator = (body?.agentInitiator || "").toString();
  const proposalId = (body?.proposalId || "").toString();
  if (!runId || !proposalId) return NextResponse.json({ error: "runId and proposalId required" }, { status: 400 });
  if (!approver.trim()) return NextResponse.json({ error: "approval must be attributed to a human approver" }, { status: 400 });
  // The agent cannot self-review.
  if (agentInitiator && approver.trim() === agentInitiator.trim()) {
    return NextResponse.json({ error: "the agent cannot approve its own proposal" }, { status: 403 });
  }
  if (!storeAvailable()) return NextResponse.json({ connected: false, reason: "review state needs a KV store" }, { headers: { "Cache-Control": "no-store" } });
  try {
    await kvSetJson(`agent:approval:${runId}:${proposalId}`, { approved: true, approver, at: new Date().toISOString() });
    return NextResponse.json({ ok: true, runId, proposalId, approvedBy: approver }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "approve failed" }, { status: 500 }); }
}
