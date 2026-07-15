// Watchlist CRUD — server-side. Entities monitored 24/7 for Brand Watch.
// Requires the KV store; without it, returns connected:false so the UI shows a
// visible "monitoring not connected" state instead of faking persistence.

import { NextRequest, NextResponse } from "next/server";
import { addWatch, listWatches, recentAlerts, removeWatch, watchAvailable } from "@/lib/narrative/watch";

export const runtime = "nodejs";

export async function GET() {
  if (!watchAvailable()) {
    return NextResponse.json({ connected: false, watches: [], alerts: [],
      reason: "Persistent monitoring needs a KV store (set KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN)." });
  }
  return NextResponse.json({ connected: true, watches: await listWatches(), alerts: await recentAlerts() });
}

export async function POST(req: NextRequest) {
  if (!watchAvailable()) {
    return NextResponse.json({ error: "monitoring store not connected" }, { status: 503 });
  }
  const name = (req.nextUrl.searchParams.get("name") || "").trim();
  const query = req.nextUrl.searchParams.get("query")?.trim() || undefined;
  if (name.length < 2) return NextResponse.json({ error: "name must be at least 2 characters" }, { status: 400 });
  return NextResponse.json(await addWatch(name, query));
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await removeWatch(id);
  return NextResponse.json({ deleted: id });
}
