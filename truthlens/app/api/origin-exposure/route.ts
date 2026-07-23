// Origin-exposure audit endpoint - DEFENSIVE posture check for a domain you are
// authorized to inspect. Reads only public, passive records (Certificate
// Transparency + DNS); never probes or connects to the origin. nodejs runtime
// because it uses the dns module and follows CDN range files.

import { NextRequest, NextResponse } from "next/server";
import { auditOriginExposure } from "@/lib/origin-exposure";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let domain: string;
  let customSubs: string[] | undefined;
  try {
    const body = await req.json();
    domain = body.domain || body.url || "";
    if (Array.isArray(body.customSubs)) customSubs = body.customSubs.map(String).slice(0, 200);
    else if (typeof body.wordlist === "string") customSubs = body.wordlist.split(/[\s,]+/).filter(Boolean).slice(0, 200);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!domain) {
    return NextResponse.json({ error: "Provide a domain, e.g. example.com" }, { status: 400 });
  }

  try {
    const report = await auditOriginExposure(domain, { customSubs });
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Audit failed" }, { status: 500 });
  }
}
