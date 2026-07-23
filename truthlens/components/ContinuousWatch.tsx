"use client";

// Continuous Brand Watch - the REAL 24/7 monitor, surfaced on /monitor.
// Talks to the server-side watch engine (/api/watch) that a daily Vercel Cron
// (/api/watch/scan) re-scans, snapshots against a rolling baseline, and alerts
// on escalation (Telegram / webhook). This is genuinely continuous and
// persistent - it needs a KV store, so when KV isn't connected the component
// shows an honest "not connected" setup panel instead of faking persistence
// (CLAUDE.md rule 7). Public data only; alerts inform, never act.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radar, Plus, X, RefreshCw, Loader2, Bell, ShieldCheck, ShieldQuestion, ShieldAlert, PlugZap } from "lucide-react";
import { fmtDate } from "@/lib/ui";

interface Watch {
  id: string; name: string; query?: string; enabled: boolean;
  lastScore: number | null; lastStatus: string | null; lastCheckedAt?: string;
}
interface WatchAlert {
  id: string; entity: string; status: string; score: number | null;
  title: string; body: string; at: string; delivered: boolean;
}
interface WatchState { connected: boolean; watches: Watch[]; alerts: WatchAlert[]; reason?: string }

const STATUS_UI: Record<string, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  CALM: { label: "Calm", cls: "border-risk-legit/40 bg-risk-legit/10 text-risk-legit", Icon: ShieldCheck },
  ELEVATED: { label: "Elevated", cls: "border-risk-unknown/40 bg-risk-unknown/10 text-risk-unknown", Icon: ShieldQuestion },
  UNDER_ATTACK: { label: "Under attack", cls: "border-risk-high/40 bg-risk-high/10 text-risk-high", Icon: ShieldAlert },
};

export default function ContinuousWatch() {
  const [state, setState] = useState<WatchState>({ connected: false, watches: [], alerts: [] });
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/watch", { cache: "no-store" });
      setState(await r.json());
    } catch {
      setState({ connected: false, watches: [], alerts: [], reason: "Could not reach the monitoring service." });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = input.trim();
    if (name.length < 2) { setErr("Enter a brand or term (2+ characters)."); return; }
    setErr(""); setInput(""); setBusy(true);
    try {
      const r = await fetch(`/api/watch?name=${encodeURIComponent(name)}`, { method: "POST" });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || "Could not add."); }
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try { await fetch(`/api/watch?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    finally { setBusy(false); }
  };

  // Manual trigger of the same routine the daily cron runs - re-scans every
  // watched entity now and refreshes the alert feed.
  const scanNow = async () => {
    setScanning(true); setScanNote("");
    try {
      const r = await fetch("/api/watch/scan", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setScanNote(d.reason || d.error || "Scan failed."); }
      else {
        const checked = typeof d.checked === "number" ? d.checked : state.watches.length;
        const esc = typeof d.escalations === "number" ? d.escalations : 0;
        setScanNote(`Checked ${checked} entit${checked === 1 ? "y" : "ies"}${esc > 0 ? ` · ${esc} escalation${esc === 1 ? "" : "s"}` : " · no new escalations"}.`);
      }
      await load();
    } catch { setScanNote("Scan failed."); }
    finally { setScanning(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-brand-soft" />
          <h2 className="font-display text-xl font-bold">Continuous <span className="gradient-text">Brand Watch</span></h2>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-secondary">24/7 · server-side</span>
        </div>
        {state.connected && (
          <button className="btn text-sm no-print" onClick={scanNow} disabled={scanning || state.watches.length === 0}>
            {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</> : <><RefreshCw className="h-4 w-4" /> Scan now</>}
          </button>
        )}
      </div>

      <p className="max-w-2xl text-sm text-ink-secondary no-print">
        Add a brand or term and TruthLens re-scans it <span className="text-ink">on a daily schedule</span> (Vercel Cron),
        tracks it against a rolling baseline, and raises an <span className="text-ink">alert</span> when the pattern escalates -
        delivered to Telegram or a webhook if configured. This runs on the server, so it keeps watching after you close the tab.
      </p>

      {loading ? (
        <div className="card flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin text-brand-soft" /> Checking monitoring service…</div>
      ) : !state.connected ? (
        // Honest "not connected" state - what to set to turn it on. No faking.
        <div className="card border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-2">
            <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" />
            <div className="space-y-2 text-sm">
              <div className="font-semibold text-yellow-100">Continuous monitoring is not connected yet.</div>
              <p className="text-ink-secondary">
                {state.reason || "Persistent 24/7 monitoring needs a KV store."} The daily cron is already scheduled in the
                deployment - it starts working the moment a store is attached. To enable it, set these environment variables in
                Vercel and redeploy:
              </p>
              <ul className="space-y-1 text-xs text-ink-secondary">
                <li>• <code className="text-ink">KV_REST_API_URL</code> + <code className="text-ink">KV_REST_API_TOKEN</code> <span className="text-ink-muted">(Vercel KV)</span> — or <code className="text-ink">UPSTASH_REDIS_REST_URL</code> + <code className="text-ink">UPSTASH_REDIS_REST_TOKEN</code></li>
                <li>• <span className="text-ink-secondary">Optional alert channels:</span> <code className="text-ink">TELEGRAM_BOT_TOKEN</code> + <code className="text-ink">TELEGRAM_ALERT_CHAT_ID</code>, or <code className="text-ink">ALERT_WEBHOOK_URL</code></li>
                <li>• <span className="text-ink-secondary">Optional:</span> <code className="text-ink">CRON_SECRET</code> to authorize the scheduled scan</li>
              </ul>
              <p className="text-xs text-ink-secondary">
                Until then you can still spot-check any term manually below, or in the{" "}
                <Link href="/platform" className="text-brand-soft hover:underline">Brand Watch</Link> console.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <form onSubmit={add} className="no-print">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setErr(""); }}
                placeholder="Add a brand or term to monitor 24/7 - e.g. Acme Corp"
                className="w-full rounded-xl border border-white/15 bg-bg-card px-4 py-3 text-base outline-none transition focus:border-brand"
              />
              <button type="submit" className="btn shrink-0" disabled={busy}><Plus className="h-4 w-4" /> Watch</button>
            </div>
            {err && <p className="mt-2 text-sm text-risk-high">{err}</p>}
            {scanNote && <p className="mt-2 text-xs text-ink-secondary">{scanNote}</p>}
          </form>

          {state.watches.length === 0 ? (
            <div className="card text-center text-sm text-ink-secondary">
              No entities watched yet - add one above and it will be re-scanned on the daily schedule.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {state.watches.map((w) => {
                const ui = (w.lastStatus && STATUS_UI[w.lastStatus]) || null;
                const Icon = ui?.Icon;
                return (
                  <div key={w.id} className="card">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="truncate font-semibold">{w.name}</div>
                      <button onClick={() => remove(w.id)} disabled={busy} className="rounded p-1 text-ink-secondary hover:bg-white/5 hover:text-risk-high" title="Stop watching"><X className="h-4 w-4" /></button>
                    </div>
                    {ui ? (
                      <div className={`inline-flex items-center gap-2 rounded-lg border ${ui.cls} px-2 py-1 text-sm`}>
                        {Icon && <Icon className="h-4 w-4" />}
                        <span className="font-semibold">{ui.label}</span>
                        {typeof w.lastScore === "number" && <span className="opacity-80">{w.lastScore}/100</span>}
                      </div>
                    ) : (
                      <div className="text-sm text-ink-secondary">Awaiting first scheduled scan.</div>
                    )}
                    <div className="mt-2 text-xs text-ink-secondary">
                      {w.lastCheckedAt ? <>last checked {fmtDate(w.lastCheckedAt)}</> : "not checked yet"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent escalation alerts - the actual "you were alerted" record. */}
          <div className="card">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4 text-brand-soft" /> Recent alerts
              <span className="text-xs font-normal text-ink-secondary">· raised when a watched term escalates</span>
            </div>
            {state.alerts.length === 0 ? (
              <p className="text-sm text-ink-secondary">No alerts yet. You&apos;ll see one here (and on any configured Telegram/webhook) when a watched term&apos;s pattern worsens.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {state.alerts.slice(0, 8).map((a) => {
                  const ui = STATUS_UI[a.status];
                  return (
                    <li key={a.id} className="py-2">
                      <div className="flex items-center gap-2 text-sm">
                        {ui && <span className={`rounded px-1.5 py-0.5 text-xs ${ui.cls}`}>{ui.label}</span>}
                        <span className="font-medium text-ink">{a.title}</span>
                        <span className="ml-auto text-xs text-ink-secondary">{fmtDate(a.at)}</span>
                      </div>
                      {a.body && <p className="mt-0.5 text-xs text-ink-secondary">{a.body}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
