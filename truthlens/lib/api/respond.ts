// Shared response envelope + guard for the /api/v1 surface. One consistent shape
// { ok, version, data | error }, CORS for cross-origin programmatic use, and a
// single place that runs auth + rate limiting before a handler executes.

import { NextResponse } from "next/server";
import { API_VERSION, authenticateApi } from "./auth";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key",
  "Cache-Control": "no-store, max-age=0",
};

export function apiOk(data: unknown, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ ok: true, version: API_VERSION, data }, { headers: { ...CORS, ...extraHeaders } });
}

export function apiError(status: number, error: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ ok: false, version: API_VERSION, error }, { status, headers: { ...CORS, ...extraHeaders } });
}

export function apiOptions() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Minute bucket for rate limiting — passed in so handlers stay pure-ish. */
function nowMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

/**
 * Run auth + rate limit, then the handler. On any auth/limit failure returns the
 * honest error envelope; otherwise the handler's NextResponse, with rate-limit
 * headers merged in.
 */
export async function withApiAuth(req: Request, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  const auth = await authenticateApi(req, nowMinute());
  if (!auth.ok) return apiError(auth.status, auth.error || "unauthorized", auth.headers);
  try {
    const res = await handler();
    if (auth.headers) for (const [k, v] of Object.entries(auth.headers)) res.headers.set(k, v);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  } catch (e: any) {
    return apiError(500, e?.message || "internal error", auth.headers);
  }
}
