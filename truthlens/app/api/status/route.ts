// Machine-readable connection status (mirror of the /status page). Reflects the
// current deployment's env, so it is never cached.

import { NextResponse } from "next/server";
import { connectionSummary } from "@/lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { total, connected, byCategory } = connectionSummary();
  // Never leak values - only names + whether present.
  return NextResponse.json({
    total,
    connected,
    categories: byCategory.map((g) => ({
      category: g.category,
      items: g.items.map((i) => ({
        key: i.key, label: i.label, connected: i.connected,
        keyless: i.keyless, missing: i.missing,
      })),
    })),
    generatedAt: new Date().toISOString(),
  });
}
