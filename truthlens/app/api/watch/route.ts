// Watchlist CRUD - server-side. Entities monitored 24/7 for Brand Watch.
// Requires the KV store; without it, returns connected:false so the UI shows a
// visible "monitoring not connected" state instead of faking persistence.

import { NextRequest, NextResponse } from "next/server";
import { addWatch, listWatches, recentAlerts, removeWatch, watchAvailable } from "@/lib/narrative/watch";

export const runtime = "nodejs";
// Live data: the watchlist + alerts (and the KV-connected check) must be read
// at request time on every call. Without this, Next.js statically evaluates the
// parameterless GET at build time and serves a frozen "not connected" snapshot
// forever - so attaching KV later never takes effect until the next deploy.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Never let a CDN/browser cache the connected-state or watchlist response.
const NO_STORE = { "Cache-Control": "no-store, max-age=0, must-revalidate" };

export async function GET() {
  if (!watchAvailable()) {
    return NextResponse.json({ connected: false, watches: [], alerts: [],
      reason: "Persistent monitoring needs a KV store (set KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN)." },
      { headers: NO_STORE });
  }
  return NextResponse.json({ connected: true, watches: await listWatches(), alerts: await recentAlerts() },
    { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  if (!watchAvailable()) {
    return NextResponse.json({ error: "monitoring store not connected" }, { status: 503, headers: NO_STORE });
  }
  const name = (req.nextUrl.searchParams.get("name") || "").trim();
  const query = req.nextUrl.searchParams.get("query")?.trim() || undefined;
  if (name.length < 2) return NextResponse.json({ error: "name must be at least 2 characters" }, { status: 400, headers: NO_STORE });
  return NextResponse.json(await addWatch(name, query), { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400, headers: NO_STORE });
  await removeWatch(id);
  return NextResponse.json({ deleted: id }, { headers: NO_STORE });
}
