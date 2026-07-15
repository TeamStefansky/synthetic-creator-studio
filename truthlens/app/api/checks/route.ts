// Shared check history (KV-backed). Optional durability/team feed on top of the
// per-browser localStorage history. Without a KV store it reports connected:false
// (a visible "not connected" state) instead of pretending to persist.

import { NextRequest, NextResponse } from "next/server";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";

export const runtime = "nodejs";

const KEY = "checks:list";
const MAX = 100;

export async function GET() {
  if (!storeAvailable()) return NextResponse.json({ connected: false, checks: [] });
  return NextResponse.json({ connected: true, checks: (await kvGetJson<any[]>(KEY)) || [] });
}

export async function POST(req: NextRequest) {
  if (!storeAvailable()) return NextResponse.json({ connected: false });
  let rec: any;
  try { rec = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!rec?.id) return NextResponse.json({ error: "record.id required" }, { status: 400 });
  const all = [rec, ...((await kvGetJson<any[]>(KEY)) || []).filter((c) => c.id !== rec.id)].slice(0, MAX);
  await kvSetJson(KEY, all);
  return NextResponse.json({ connected: true, saved: rec.id });
}
