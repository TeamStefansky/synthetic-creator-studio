// Connections: user-managed RSS/Atom feed CRUD. Every add/test VALIDATES the URL
// server-side through the SSRF-guarded fetcher (a user URL is untrusted) and never
// saves a feed that does not parse. Persistence is the single-workspace KV store;
// when KV is absent the API still validates + previews but reports connected:false
// so the client keeps the feed in localStorage (honest, never faked).

import { NextResponse } from "next/server";
import {
  listFeeds, addFeed, removeFeed, updateFeed, validateAndPreview, feedsConnected,
} from "@/lib/feeds/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nowIso = () => new Date().toISOString();
const newId = () => (globalThis.crypto?.randomUUID?.() || `feed-${Date.now()}-${Math.round(Math.random() * 1e6)}`);
const errMsg = (e: any) => (e?.message || "request failed").toString().slice(0, 200);

export async function GET() {
  const connected = feedsConnected();
  const feeds = await listFeeds().catch(() => []);
  return NextResponse.json({ connected, feeds }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { /* handled */ }
  const action = String(body?.action || "add");
  const url = String(body?.url || "").trim();
  if (!url) return NextResponse.json({ error: "Provide a feed URL." }, { status: 400 });

  try {
    if (action === "preview" || action === "test") {
      const preview = await validateAndPreview(url); // validates + SSRF; no save
      return NextResponse.json({ ok: true, preview, connected: feedsConnected() });
    }
    // add
    if (!feedsConnected()) {
      // No KV: validate + preview so the client can store it locally (honest state).
      const preview = await validateAndPreview(url);
      return NextResponse.json({ ok: true, connected: false, preview });
    }
    const { feed, preview } = await addFeed(url, nowIso(), newId());
    return NextResponse.json({ ok: true, connected: true, feed, preview });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!feedsConnected()) return NextResponse.json({ connected: false, error: "Feed store not connected (KV)." }, { status: 400 });
  let body: any = {};
  try { body = await req.json(); } catch { /* handled */ }
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Missing feed id." }, { status: 400 });
  const patch: { enabled?: boolean; title?: string } = {};
  if (typeof body?.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body?.title === "string") patch.title = body.title;
  const feed = await updateFeed(id, patch);
  if (!feed) return NextResponse.json({ error: "Feed not found." }, { status: 404 });
  return NextResponse.json({ ok: true, feed });
}

export async function DELETE(req: Request) {
  if (!feedsConnected()) return NextResponse.json({ connected: false, error: "Feed store not connected (KV)." }, { status: 400 });
  let body: any = {};
  try { body = await req.json(); } catch { /* handled */ }
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Missing feed id." }, { status: 400 });
  await removeFeed(id);
  return NextResponse.json({ ok: true });
}
