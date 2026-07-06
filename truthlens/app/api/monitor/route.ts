// Scheduled monitoring with change detection. Re-analyzes a watchlist, compares
// against the previous snapshot in the KV store, and alerts on meaningful
// changes (band worsened, score jump, coordination up, narrative/amplification
// spike, or first-seen HIGH RISK). Driven by Vercel Cron (see vercel.json).
//
// Env:
//   MONITOR_DOMAINS   comma-separated domains to watch
//   ALERT_WEBHOOK_URL Slack-compatible incoming webhook ({text:...})
//   CRON_SECRET       if set, requests must send "Authorization: Bearer <secret>"
//   SITE_PASSWORD     used to call /api/analyze when the site is password-gated
//   KV_REST_API_URL / KV_REST_API_TOKEN (Vercel KV) or UPSTASH_REDIS_REST_*
//                     enable history/change-detection (without it: current-state only)

import { NextRequest, NextResponse } from "next/server";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Snapshot {
  band?: string;
  score?: number;
  coordination?: string;
  republishers?: number;
  narratives?: string[];
  ts?: string;
}

const BAND_RANK: Record<string, number> = { LIKELY_LEGITIMATE: 0, UNKNOWN: 1, HIGH_RISK: 2 };
const COORD_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2 };

function diff(prev: Snapshot | null, cur: Snapshot): string[] {
  const changes: string[] = [];
  if (!prev) {
    if (cur.band === "HIGH_RISK") changes.push(`first seen as HIGH RISK (score ${cur.score})`);
    return changes;
  }
  if (BAND_RANK[cur.band || ""] > BAND_RANK[prev.band || ""]) changes.push(`risk band worsened: ${prev.band} → ${cur.band}`);
  if ((cur.score ?? 0) - (prev.score ?? 0) >= 12) changes.push(`score jumped ${prev.score} → ${cur.score}`);
  if (COORD_RANK[cur.coordination || "Low"] > COORD_RANK[prev.coordination || "Low"]) changes.push(`coordination rose: ${prev.coordination} → ${cur.coordination}`);
  const pr = prev.republishers ?? 0;
  const cr = cur.republishers ?? 0;
  if (cr >= pr * 2 && cr - pr >= 5) changes.push(`amplification spike: ${pr} → ${cr} republishers`);
  const prevN = new Set((prev.narratives || []).map((n) => n.toLowerCase()));
  const fresh = (cur.narratives || []).filter((n) => !prevN.has(n.toLowerCase()));
  if (fresh.length) changes.push(`new narrative(s): ${fresh.slice(0, 3).join(" | ")}`);
  return changes;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domains = (process.env.MONITOR_DOMAINS || "").split(",").map((d) => d.trim()).filter(Boolean);
  if (domains.length === 0) return NextResponse.json({ ok: true, note: "No MONITOR_DOMAINS configured." });

  const origin = req.nextUrl.origin;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.SITE_PASSWORD) {
    headers.Authorization = "Basic " + Buffer.from(`monitor:${process.env.SITE_PASSWORD}`).toString("base64");
  }
  const now = new Date().toISOString();
  const hasStore = storeAvailable();

  const out: { domain: string; band?: string; score?: number; changes?: string[]; error?: string }[] = [];
  const alerts: { domain: string; score?: number; changes: string[] }[] = [];

  for (const domain of domains.slice(0, 25)) {
    try {
      const r = await fetch(`${origin}/api/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: `https://${domain}` }),
      });
      const data = await r.json();
      if (!r.ok) {
        out.push({ domain, error: data.error || `HTTP ${r.status}` });
        continue;
      }
      const cur: Snapshot = {
        band: data.risk?.band,
        score: data.risk?.score,
        coordination: data.coordination?.level,
        republishers: data.propagation?.hits?.length ?? 0,
        narratives: data.contentAnalysis?.narratives ?? [],
        ts: now,
      };

      let changes: string[] = [];
      if (hasStore) {
        const prev = await kvGetJson<Snapshot>(`monitor:snap:${domain}`);
        changes = diff(prev, cur);
        await kvSetJson(`monitor:snap:${domain}`, cur);
        // Append a timeline point (capped) for the dashboard.
        const hist = (await kvGetJson<any[]>(`monitor:hist:${domain}`)) || [];
        hist.push({ ts: now, band: cur.band, score: cur.score, coordination: cur.coordination, changes });
        while (hist.length > 60) hist.shift();
        await kvSetJson(`monitor:hist:${domain}`, hist);
      } else if (cur.band === "HIGH_RISK") {
        changes = ["HIGH RISK (no history store configured — current-state alert)"];
      }

      out.push({ domain, band: cur.band, score: cur.score, changes });
      if (changes.length) alerts.push({ domain, score: cur.score, changes });
    } catch (e: any) {
      out.push({ domain, error: e?.message || "failed" });
    }
  }

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (alerts.length > 0 && webhook) {
    const text =
      `🔎 *TruthLens monitor* — ${alerts.length} change(s) detected\n` +
      alerts.map((a) => `• *${a.domain}* (score ${a.score}): ${a.changes.join("; ")}`).join("\n");
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    checked: out.length,
    alerts: alerts.length,
    historyEnabled: hasStore,
    results: out,
  });
}
