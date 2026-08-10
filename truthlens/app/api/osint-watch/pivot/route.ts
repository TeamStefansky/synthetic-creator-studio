// OSINT pivot API — run the reverse-lookup / enumeration adapters for a selector
// (shared AdSense/analytics id, shared code string, or a domain). Connected
// providers query live; the rest report honest not-connected. Members are a
// co-behavior LEAD, never proof of a shared operation.

import { NextRequest, NextResponse } from "next/server";
import { runPivot, adaptersForKind } from "@/lib/osint/adapters";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

const KINDS = new Set(["ga_id", "adsense_id", "gtm_id", "fb_pixel_id", "yandex_id", "hotjar_id", "clarity_id", "verification_token", "code", "domain"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || "").trim();
    const value = String(body?.value || "").trim();
    if (!KINDS.has(kind)) return NextResponse.json({ error: `kind must be one of: ${[...KINDS].join(", ")}` }, { status: 400, headers: NO_STORE });
    if (value.length < 3) return NextResponse.json({ error: "value must be at least 3 characters" }, { status: 400, headers: NO_STORE });
    if (adaptersForKind(kind).length === 0) return NextResponse.json({ error: `no adapters for kind '${kind}'` }, { status: 400, headers: NO_STORE });
    const result = await runPivot(kind, value);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "pivot failed" }, { status: 500, headers: NO_STORE });
  }
}
