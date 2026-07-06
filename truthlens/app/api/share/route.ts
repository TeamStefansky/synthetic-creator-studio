// Share a Post Check result via a short link + power the recent-checks gallery.
// Stores results in the KV store (Vercel KV / Upstash). Falls back gracefully
// when no store is configured (the UI then offers copy-to-clipboard instead).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";

export const runtime = "nodejs";

interface IndexEntry {
  id: string;
  verdict: string;
  summary: string;
  ts: string;
}

export async function POST(req: NextRequest) {
  if (!storeAvailable()) {
    return NextResponse.json({ error: "no-store" }, { status: 501 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = body.result;
  if (!result) return NextResponse.json({ error: "Missing result" }, { status: 400 });

  const id = randomUUID().slice(0, 10);
  const ts = new Date().toISOString();
  await kvSetJson(`share:${id}`, { kind: "post-check", result, ts });

  // Maintain a capped recent index for the gallery.
  const index = (await kvGetJson<IndexEntry[]>("share:index")) || [];
  index.unshift({ id, verdict: String(result.verdict || "Unverified"), summary: String(result.summary || "").slice(0, 200), ts });
  await kvSetJson("share:index", index.slice(0, 60));

  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (req.nextUrl.searchParams.get("list") != null || !id) {
    const index = (await kvGetJson<IndexEntry[]>("share:index")) || [];
    return NextResponse.json({ available: storeAvailable(), items: index });
  }
  const data = await kvGetJson<any>(`share:${id}`);
  if (!data) return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  return NextResponse.json(data);
}
