// Meta OAuth callback. Verifies the CSRF state, exchanges the authorization
// code for a user access token ON THE SERVER (app secret never leaves the
// server), confirms the token with a real /me read, then:
//   - stores the token in an httpOnly cookie (never readable by client JS), and
//   - grants the normal TruthLens session cookie - a REAL Meta login is a valid
//     way through the front door (the access-password path stays as-is).
// Denied consent / any error → back to /login with an honest error flag.

import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";
import { fbConfigured, fbExchangeCode, fbMe, fbRedirectUri, FB_STATE_COOKIE, FB_TOKEN_COOKIE } from "@/lib/facebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backToLogin(origin: string, flag: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("fb", flag);
  const res = NextResponse.redirect(url);
  res.cookies.set(FB_STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;

  if (!fbConfigured()) return backToLogin(origin, "not_configured");
  // The user pressed Cancel on Meta's dialog - report it honestly.
  if (params.get("error")) return backToLogin(origin, "denied");

  const code = params.get("code") || "";
  const state = params.get("state") || "";
  let saved: { state?: string; next?: string } = {};
  try { saved = JSON.parse(req.cookies.get(FB_STATE_COOKIE)?.value || "{}"); } catch { /* treated as mismatch */ }
  if (!code || !state || !saved.state || state !== saved.state) {
    return backToLogin(origin, "state_mismatch");
  }

  try {
    const token = await fbExchangeCode(code, fbRedirectUri(origin));
    await fbMe(token); // confirm the token is live before granting a session

    const next = saved.next && saved.next.startsWith("/") ? saved.next : "/tools/meta";
    const res = NextResponse.redirect(new URL(next, origin));
    const secure = origin.startsWith("https");
    res.cookies.set(FB_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days (token itself is long-lived ~60d)
    });
    // Real Meta authentication grants the platform session (same cookie the
    // password path sets) so the reviewer lands directly on the monitoring UI.
    res.cookies.set(AUTH_COOKIE, (await expectedToken()) || "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.cookies.set(FB_STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  } catch {
    return backToLogin(origin, "exchange_failed");
  }
}
