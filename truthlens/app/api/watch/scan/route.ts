// Scheduled Brand Watch monitoring - invoked by Vercel Cron (and manual trigger).
// Re-scans every enabled watched entity, snapshots it against a rolling baseline,
// and dispatches an escalation alert (Telegram / webhook) when status worsens.
//
// Auth: if CRON_SECRET is set, requests must send "Authorization: Bearer <secret>"
// (Vercel Cron sends it automatically). Open otherwise for manual runs.

import { NextRequest, NextResponse } from "next/server";
import { runAllWatched, watchAvailable } from "@/lib/narrative/watch";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!watchAvailable()) {
    return NextResponse.json({ connected: false, reason: "KV store not configured" }, { status: 503 });
  }
  return NextResponse.json(await runAllWatched());
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
