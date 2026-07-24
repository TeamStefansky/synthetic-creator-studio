// Crypto address OSINT API - public blockchain explorer lookup (read-only).

import { NextRequest, NextResponse } from "next/server";
import { lookupCryptoAddress } from "@/lib/crypto-osint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") || "").trim();
  try {
    const info = await lookupCryptoAddress(address);
    return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ address, chain: "unknown", found: false, note: e?.message || "lookup failed" }, { status: 500 });
  }
}
