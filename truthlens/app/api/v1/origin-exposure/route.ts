// GET /api/v1/origin-exposure?domain=example.com — programmatic origin-exposure
// audit. Wraps the same engine the UI uses (passive CT + DNS + RDAP, cached),
// including documented host conduct. Key-authed + rate-limited.

import { NextResponse } from "next/server";
import { auditOriginExposure } from "@/lib/origin-exposure";
import { apiOk, apiError, apiOptions, withApiAuth } from "@/lib/api/respond";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

export function OPTIONS() { return apiOptions(); }

export async function GET(req: Request) {
  return withApiAuth(req, async () => {
    const domain = (new URL(req.url).searchParams.get("domain") || "").trim();
    if (domain.length < 2) return apiError(400, "Query param 'domain' is required (>= 2 chars).");
    const report = await auditOriginExposure(domain);
    return apiOk(report);
  });
}
