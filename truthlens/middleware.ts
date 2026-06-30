import { NextRequest, NextResponse } from "next/server";

// Optional site-wide password gate (HTTP Basic Auth).
// - Locked ONLY when the SITE_PASSWORD environment variable is set.
// - Any username is accepted; the password must equal SITE_PASSWORD.
// - The password is NEVER stored in the repo — set it in the host's env vars.
// Without SITE_PASSWORD the site is open (so local dev isn't blocked).

export const config = {
  // Protect everything except Next.js internals and common static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const pass = decoded.slice(decoded.indexOf(":") + 1);
        if (pass === password) return NextResponse.next();
      } catch {
        /* fall through to 401 */
      }
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TruthLens", charset="UTF-8"' },
  });
}
