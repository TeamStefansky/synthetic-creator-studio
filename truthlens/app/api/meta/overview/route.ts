// Meta monitoring overview - GET returns, from the server-held token:
//   profile  (public_profile)        - who connected
//   pages    (pages_show_list)       - Pages the user manages, via /me/accounts
//   pages[].instagram (instagram_basic) - each Page's linked IG professional account
// Page access tokens from /me/accounts are used server-side only and are NEVER
// included in the response. No token → { connected: false } honestly (rule 7).
// DELETE disconnects (clears the Facebook token cookie; the site session stays).

import { NextRequest, NextResponse } from "next/server";
import { fbMe, fbPages, FB_TOKEN_COOKIE } from "@/lib/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const token = req.cookies.get(FB_TOKEN_COOKIE)?.value || "";
  if (!token) return NextResponse.json({ connected: false }, { headers: NO_STORE });

  try {
    const [profile, pages] = await Promise.all([fbMe(token), fbPages(token)]);
    return NextResponse.json(
      {
        connected: true,
        profile,
        // Strip the page access tokens - they stay server-side only.
        pages: pages.map(({ access_token: _t, ...page }) => page),
      },
      { headers: NO_STORE },
    );
  } catch (e: any) {
    // Expired/revoked token → an honest disconnected state, never a faked panel.
    const res = NextResponse.json(
      { connected: false, error: e?.message || "Meta Graph call failed - please reconnect." },
      { headers: NO_STORE },
    );
    res.cookies.set(FB_TOKEN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  res.cookies.set(FB_TOKEN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
