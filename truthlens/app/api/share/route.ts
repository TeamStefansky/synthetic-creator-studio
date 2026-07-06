// Share a Post Check result via a short link. Stores the result JSON in the KV
// store (Vercel KV / Upstash) under a random id. Falls back to "unavailable"
// when no store is configured (the UI then offers copy-to-clipboard instead).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";

export const runtime = "nodejs";

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
  if (!body.result) return NextResponse.json({ error: "Missing result" }, { status: 400 });
  const id = randomUUID().slice(0, 10);
  await kvSetJson(`share:${id}`, { kind: "post-check", result: body.result, ts: new Date().toISOString() });
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const data = await kvGetJson<any>(`share:${id}`);
  if (!data) return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  return NextResponse.json(data);
}
