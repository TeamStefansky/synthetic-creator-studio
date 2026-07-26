// Access-gate login/logout. POST { password } → sets the httpOnly auth cookie when
// the password matches SITE_PASSWORD. DELETE → clears it. No password is ever
// returned or logged; the cookie holds only a SHA-256 token. Honest state when the
// gate is not configured (never fakes a successful login).

import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, gateEnabled, accessPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!gateEnabled()) {
    return NextResponse.json(
      { ok: false, connected: false, error: "No access gate is configured on this deployment (SITE_PASSWORD is not set)." },
      { status: 400 },
    );
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const password = String(body?.password || "");
  if (!password) return NextResponse.json({ ok: false, error: "Enter the access password." }, { status: 400 });

  if (password !== accessPassword()) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await authToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
