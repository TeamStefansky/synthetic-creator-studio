// GET /api/v1 — discovery. Lists the endpoints, auth scheme, and whether the API
// is enabled on this deployment. Does not require a key (so clients can discover
// how to authenticate), but reports the enabled state honestly.

import { NextResponse } from "next/server";
import { apiKeysConfigured } from "@/lib/api/auth";
import { apiOk, apiOptions } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() { return apiOptions(); }

export async function GET() {
  return apiOk({
    name: "TruthLens API",
    version: "v1",
    enabled: apiKeysConfigured(),
    auth: "Send your key as 'Authorization: Bearer <key>' or 'x-api-key: <key>'. Set TRUTHLENS_API_KEYS on the deployment to enable.",
    rateLimit: "Per-key, per-minute (best-effort when a KV store is configured). See X-RateLimit-* headers.",
    framing: "Every result is a decision-support indicator with confidence + evidence + an alternative — never a verdict, and never a named private individual.",
    endpoints: [
      { method: "GET", path: "/api/v1/origin-exposure", params: { domain: "required" }, desc: "Passive origin-exposure audit (CT + DNS + RDAP) with documented host conduct." },
      { method: "GET", path: "/api/v1/radar", params: { entity: "required", horizon: "optional days", baseScore: "optional 0-100" }, desc: "Early-warning narrative-escalation forecast (band + hazard + leading indicators)." },
      { method: "GET", path: "/api/v1/host-conduct", params: { asn: "optional", org: "optional", host: "optional" }, desc: "Documented, cited public-record conduct for a host/ASN/operator." },
    ],
  });
}
