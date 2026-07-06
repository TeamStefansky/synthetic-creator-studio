// Scheduled monitoring: re-analyze a watchlist of domains and push an alert to
// a webhook when any is HIGH RISK. Driven by Vercel Cron (see vercel.json).
//
// Env:
//   MONITOR_DOMAINS   comma-separated domains to watch
//   ALERT_WEBHOOK_URL Slack-compatible incoming webhook ({text:...}) for alerts
//   CRON_SECRET       if set, requests must send "Authorization: Bearer <secret>"
//   SITE_PASSWORD     if the site is password-gated, used to call /api/analyze
//
// Note: stateless (no DB) — it reports current status each run rather than
// diffing against history. Add a datastore for true change/spike detection.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const domains = (process.env.MONITOR_DOMAINS || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (domains.length === 0) {
    return NextResponse.json({ ok: true, note: "No MONITOR_DOMAINS configured." });
  }

  const origin = req.nextUrl.origin;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.SITE_PASSWORD) {
    headers.Authorization =
      "Basic " + Buffer.from(`monitor:${process.env.SITE_PASSWORD}`).toString("base64");
  }

  const results: { domain: string; band?: string; score?: number; error?: string }[] = [];
  for (const domain of domains.slice(0, 25)) {
    try {
      const r = await fetch(`${origin}/api/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: `https://${domain}` }),
      });
      const data = await r.json();
      if (!r.ok) results.push({ domain, error: data.error || `HTTP ${r.status}` });
      else results.push({ domain, band: data.risk?.band, score: data.risk?.score });
    } catch (e: any) {
      results.push({ domain, error: e?.message || "failed" });
    }
  }

  const alerts = results.filter((r) => r.band === "HIGH_RISK");
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (alerts.length > 0 && webhook) {
    const text =
      `🔴 TruthLens monitor: ${alerts.length} HIGH RISK site(s)\n` +
      alerts.map((a) => `• ${a.domain} — score ${a.score}/100`).join("\n");
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, checked: results.length, alerts: alerts.length, results });
}
