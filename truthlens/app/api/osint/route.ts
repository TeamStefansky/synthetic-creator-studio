// On-demand deep OSINT research endpoint. Slow + costs Anthropic tokens, so it
// is triggered explicitly from the report page, not as part of /api/analyze.

import { NextRequest, NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { researchDomain } from "@/lib/osint";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let domain: string;
  try {
    domain = body.domain || normalizeUrl(body.url).domain;
  } catch {
    return NextResponse.json({ error: "Provide a valid domain or url" }, { status: 400 });
  }

  const dossier = await researchDomain(domain, {
    finalUrl: body.finalUrl,
    registrantOrg: body.registrantOrg,
    siblingDomains: Array.isArray(body.siblingDomains) ? body.siblingDomains : [],
  });

  return NextResponse.json(dossier);
}
