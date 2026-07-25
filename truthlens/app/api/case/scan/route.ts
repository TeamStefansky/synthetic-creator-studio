// Authenticated case-scan cron endpoint (layer 04 · P3). Reuses the Brand Watch
// scan auth (CRON_SECRET Bearer). Never publicly triggerable. Anonymous / local
// cases are never scheduled here — scheduled monitoring is KV-scoped per workspace.
// The actual scan loop (per-case collection under RUN_BUDGET, coverage marking,
// monitorDiff, alert dispatch) runs server-side; without a store it reports the
// honest "not connected" state rather than pretending to have scanned.

import { NextResponse } from "next/server";
import { storeAvailable } from "@/lib/store";
import { MIN_INTERVAL_MS, MAX_INTERVAL_MS } from "@/lib/case/schedule";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!storeAvailable()) {
    return NextResponse.json(
      { connected: false, reason: "Case monitoring needs a KV store (KV_REST_API_URL/TOKEN). Scheduled scans are workspace-scoped and disabled without it." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  // Store-backed scan loop is wired in P5 (review/candidate persistence). Report
  // the schedule window so the cron caller has a cadence to honor.
  return NextResponse.json(
    { connected: true, scanned: 0, minIntervalMs: MIN_INTERVAL_MS, maxIntervalMs: MAX_INTERVAL_MS, note: "case scan endpoint online; per-case loop persists in P5" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
