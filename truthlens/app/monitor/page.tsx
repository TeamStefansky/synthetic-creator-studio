"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, RefreshCw, Play, AlertTriangle, ExternalLink, Bell, BellOff } from "lucide-react";
import { bandLabel, bandColor, fmtDate } from "@/lib/ui";
import type { RiskBand } from "@/lib/types";
import Disclaimer from "@/components/Disclaimer";

interface HistPoint { ts: string; band?: string; score?: number; coordination?: string; changes?: string[]; }
interface Item { domain: string; latest: { band?: string; score?: number; ts?: string } | null; history: HistPoint[]; }
interface Feed { historyEnabled: boolean; configured: boolean; webhook: boolean; items: Item[]; }

function Sparkline({ points }: { points: HistPoint[] }) {
  const scores = points.map((p) => p.score ?? 0);
  if (scores.length < 2) return <div className="h-8 text-xs text-gray-600">not enough history</div>;
  const W = 160, H = 32, max = 100;
  const step = W / (scores.length - 1);
  const path = scores.map((s, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(H - (s / max) * H).toFixed(1)}`).join(" ");
  const last = scores[scores.length - 1];
  const color = last >= 66 ? "#fb7185" : last >= 36 ? "#fbbf24" : "#34d399";
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={(scores.length - 1) * step} cy={H - (last / max) * H} r={2.5} fill={color} />
    </svg>
  );
}

export default function MonitorPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/watchlist");
      setFeed(await r.json());
    } catch {
      setMsg("Failed to load watchlist.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    setMsg("");
    try {
      const r = await fetch("/api/monitor");
      const d = await r.json();
      if (!r.ok) setMsg(d.error === "Unauthorized" ? "Manual run is disabled because CRON_SECRET is set (runs happen via the daily cron)." : d.error || "Run failed.");
      else { setMsg(`Checked ${d.checked} domain(s), ${d.alerts} change(s).`); await load(); }
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setRunning(false);
    }
  };

  const allChanges = (feed?.items || [])
    .flatMap((it) => it.history.filter((h) => h.changes?.length).map((h) => ({ domain: it.domain, ...h })))
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
    .slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Monitoring Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button className="btn text-sm" onClick={runNow} disabled={running}>
            <Play className="h-4 w-4" /> {running ? "Running…" : "Run check now"}
          </button>
        </div>
      </div>

      {feed && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge on={feed.configured} onText="Watchlist configured" offText="No MONITOR_DOMAINS set" />
          <Badge on={feed.historyEnabled} onText="History store connected" offText="No KV store — current-state only" />
          <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${feed.webhook ? "border-risk-legit/30 text-risk-legit" : "border-white/10 text-gray-400"}`}>
            {feed.webhook ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            {feed.webhook ? "Alerts webhook set" : "No alert webhook"}
          </span>
        </div>
      )}

      {msg && <p className="text-sm text-gray-300">{msg}</p>}

      {!loading && feed && !feed.configured && (
        <div className="card">
          <div className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-risk-unknown" /> Not configured yet</div>
          <p className="text-sm text-gray-400">
            Set <code className="text-indigo-300">MONITOR_DOMAINS</code> (comma-separated) in your host&rsquo;s env vars, add a
            KV store for history and an <code className="text-indigo-300">ALERT_WEBHOOK_URL</code>, then redeploy. The daily cron
            (<code className="text-indigo-300">/api/monitor</code>) will populate this dashboard.
          </p>
        </div>
      )}

      {/* Watchlist grid */}
      {feed && feed.items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {feed.items.map((it) => {
            const band = (it.latest?.band as RiskBand) || "UNKNOWN";
            const c = bandColor(band);
            return (
              <div key={it.domain} className="card">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="truncate font-semibold">{it.domain}</div>
                  <Link href={`/report?url=${encodeURIComponent(it.domain)}`} className="text-indigo-400" title="Open report"><ExternalLink className="h-4 w-4" /></Link>
                </div>
                {it.latest ? (
                  <>
                    <div className={`mb-2 inline-flex items-center gap-2 rounded-lg border ${c.border} ${c.bg} px-2 py-1 text-sm`}>
                      <span className={`font-semibold ${c.text}`}>{bandLabel(band)}</span>
                      <span className="text-gray-400">{it.latest.score}/100</span>
                    </div>
                    <Sparkline points={it.history} />
                    <div className="mt-1 text-xs text-gray-500">Last checked {fmtDate(it.latest.ts)} · {it.history.length} point(s)</div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No data yet — awaiting first check.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Change timeline */}
      {allChanges.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-lg font-semibold">Recent changes</h2>
          <ul className="space-y-2">
            {allChanges.map((ch, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-white/10 bg-bg-elev p-3 text-sm">
                <span className="mt-0.5 shrink-0 text-xs text-gray-500">{fmtDate(ch.ts)}</span>
                <span className="font-medium text-gray-100">{ch.domain}</span>
                <span className="text-gray-400">{ch.changes?.join("; ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}

function Badge({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${on ? "border-risk-legit/30 text-risk-legit" : "border-risk-unknown/30 text-risk-unknown"}`}>
      {on ? onText : offText}
    </span>
  );
}
