// Read-only dashboard feed: current snapshot + timeline history for every
// watched domain. (Protected by the site password gate; does NOT re-analyze.)

import { NextResponse } from "next/server";
import { kvGetJson, storeAvailable } from "@/lib/store";

export const runtime = "nodejs";
// Reflects the current deployment's env + live KV, so never statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Snapshot {
  band?: string;
  score?: number;
  coordination?: string;
  republishers?: number;
  narratives?: string[];
  ts?: string;
}
interface HistPoint {
  ts: string;
  band?: string;
  score?: number;
  coordination?: string;
  changes?: string[];
}

export async function GET() {
  const domains = (process.env.MONITOR_DOMAINS || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const hasStore = storeAvailable();
  const items = await Promise.all(
    domains.map(async (domain) => {
      const latest = hasStore ? await kvGetJson<Snapshot>(`monitor:snap:${domain}`) : null;
      const history = hasStore ? (await kvGetJson<HistPoint[]>(`monitor:hist:${domain}`)) || [] : [];
      return { domain, latest, history };
    }),
  );

  return NextResponse.json({
    historyEnabled: hasStore,
    configured: domains.length > 0,
    webhook: !!process.env.ALERT_WEBHOOK_URL,
    items,
  });
}
