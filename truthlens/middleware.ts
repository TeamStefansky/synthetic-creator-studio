import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";

// Cookie-based access gate (styled /login page instead of a Basic-Auth popup).
// - Active ONLY when SITE_PASSWORD is set; otherwise the app is open (honest
//   "gate not configured", never a fake lock).
// - /login and /welcome are always public; self-authenticating endpoints (cron via
//   CRON_SECRET, share/embed) are excluded so scheduled jobs and embeds keep working.
// - Unauthenticated page requests redirect to /login?next=…; API requests get 401.

export const config = {
  matcher: [
    // Exclude Next internals, self-authenticating endpoints, AND any static asset
    // file (a path ending in an extension) so public files like /logo-wordmark.svg
    // load on the pre-auth /welcome and /login pages instead of being redirected.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|api/auth|api/monitor|api/share|api/watch/scan|api/case/scan|api/v1|embed|.*\\.[\\w]+$).*)",
  ],
};

const PUBLIC_PATHS = ["/login", "/welcome"];

export async function middleware(req: NextRequest) {
  const expected = await expectedToken();
  if (!expected) return NextResponse.next(); // gate not configured → open

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  // Unauthenticated visitors land on the public marketing page first (the front
  // door); its "Sign in" CTA carries them to /login, which returns them to `next`.
  const url = req.nextUrl.clone();
  url.pathname = "/welcome";
  url.search = "";
  url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  return NextResponse.redirect(url);
}
