// GET /api/v1/host-conduct?asn=AS44925 (or ?org=… / ?host=…) - programmatic
// lookup of documented, cited public-record conduct for a host/ASN/operator.
// Key-authed. Unknown (not 'clean') when the reference has no record.

import { NextResponse } from "next/server";
import { buildHostConduct } from "@/lib/host-conduct";
import { apiOk, apiError, apiOptions, withApiAuth } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() { return apiOptions(); }

export async function GET(req: Request) {
  return withApiAuth(req, async () => {
    const sp = new URL(req.url).searchParams;
    const asn = (sp.get("asn") || "").trim() || undefined;
    const org = (sp.get("org") || "").trim() || undefined;
    const host = (sp.get("host") || "").trim() || undefined;
    if (!asn && !org && !host) return apiError(400, "Provide at least one of: asn, org, host.");
    const profile = buildHostConduct({ asn, org, hostName: host });
    return apiOk(profile);
  });
}
