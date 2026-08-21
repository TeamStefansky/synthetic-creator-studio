// "Continue with Facebook" entry point. Redirects the browser to Meta's OWN
// OAuth permission dialog (never a simulated one), requesting exactly the four
// review scopes. A random state value is set in a short-lived httpOnly cookie
// and verified in the callback (CSRF protection). Unconfigured deployment →
// honest redirect back to /login with an error flag (never a fake dialog).

import { NextRequest, NextResponse } from "next/server";
import { fbConfigured, fbAuthorizeUrl, fbRedirectUri, sanitizeNextPath, FB_STATE_COOKIE } from "@/lib/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!fbConfigured()) {
    const back = new URL("/login", origin);
    back.searchParams.set("fb", "not_configured");
    return NextResponse.redirect(back);
  }

  const state = crypto.randomUUID().replace(/-/g, "");
  const next = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
  const redirectUri = fbRedirectUri(origin);

  const res = NextResponse.redirect(fbAuthorizeUrl(redirectUri, state));
  // State + intended destination live in one short-lived httpOnly cookie.
  res.cookies.set(FB_STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
