// Page engagement - GET ?pageId=… returns the selected managed Page's recent
// posts with reaction / comment / share counts (pages_read_engagement). The
// Page access token is re-fetched from /me/accounts on the server for each
// request and never leaves the server. Read-only: no write endpoint exists.

import { NextRequest, NextResponse } from "next/server";
import { fbPages, fbPagePosts, FB_TOKEN_COOKIE } from "@/lib/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const token = req.cookies.get(FB_TOKEN_COOKIE)?.value || "";
  if (!token) return NextResponse.json({ error: "Not connected to Meta." }, { status: 401, headers: NO_STORE });

  const pageId = (req.nextUrl.searchParams.get("pageId") || "").trim();
  if (!pageId) return NextResponse.json({ error: "pageId is required." }, { status: 400, headers: NO_STORE });

  try {
    const pages = await fbPages(token);
    const page = pages.find((p) => p.id === pageId);
    if (!page?.access_token) {
      return NextResponse.json({ error: "That Page is not in your managed list." }, { status: 404, headers: NO_STORE });
    }
    const posts = await fbPagePosts(page.id, page.access_token);
    return NextResponse.json({ pageId: page.id, pageName: page.name, posts }, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Meta Graph call failed." }, { status: 502, headers: NO_STORE });
  }
}
