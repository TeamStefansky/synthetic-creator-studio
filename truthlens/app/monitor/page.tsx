"use client";

import { STATUS } from "@/lib/design-tokens";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, RefreshCw, Plus, Download, X, ExternalLink, Loader2, Search } from "lucide-react";
import { bandLabel, bandColor, fmtDate } from "@/lib/ui";
import type { RiskBand } from "@/lib/types";
import Disclaimer from "@/components/Disclaimer";

interface HistPoint { ts: string; band?: string; score?: number; }
interface Watch { domain: string; band?: RiskBand; score?: number; ts?: string; loading?: boolean; error?: string; history: HistPoint[]; }

const LIST_KEY = "tl:watchlist";
const histKey = (d: string) => `tl:hist:${d}`;

function normalizeDomain(input: string): string | null {
  let v = (input || "").trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\s/g, "");
  return v.includes(".") ? v : null;
}

function loadList(): string[] {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || "[]"); } catch { return []; }
}
function saveList(list: string[]) { localStorage.setItem(LIST_KEY, JSON.stringify(list)); }
function loadHist(d: string): HistPoint[] {
  try { return JSON.parse(localStorage.getItem(histKey(d)) || "[]"); } catch { return []; }
}
function saveHist(d: string, h: HistPoint[]) { localStorage.setItem(histKey(d), JSON.stringify(h.slice(-60))); }

function Sparkline({ points }: { points: HistPoint[] }) {
  const scores = points.map((p) => p.score ?? 0);
  if (scores.length < 2) return <div className="h-8 text-xs text-ink-muted">no history yet</div>;
  const W = 180, H = 32, max = 100;
  const step = W / (scores.length - 1);
  const path = scores.map((s, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(H - (s / max) * H).toFixed(1)}`).join(" ");
  const last = scores[scores.length - 1];
  const color = last >= 66 ? STATUS.high : last >= 36 ? STATUS.unknown : STATUS.legit;
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={(scores.length - 1) * step} cy={H - (last / max) * H} r={2.5} fill={color} />
    </svg>
  );
}

export default function MonitorPage() {
  const [items, setItems] = useState<Watch[]>([]);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);

  // Load persisted list on mount.
  useEffect(() => {
    const list = loadList();
    setItems(list.map((d) => ({ domain: d, history: loadHist(d) })));
  }, []);

  const persist = useCallback((next: Watch[]) => {
    setItems(next);
    saveList(next.map((w) => w.domain));
  }, []);

  const check = useCallback(async (domain: string) => {
    setItems((prev) => prev.map((w) => (w.domain === domain ? { ...w, loading: true, error: undefined } : w)));
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://${domain}` }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Analysis failed");
      const ts = new Date().toISOString();
      const hist = loadHist(domain);
      hist.push({ ts, band: data.risk?.band, score: data.risk?.score });
      saveHist(domain, hist);
      setItems((prev) => prev.map((w) => (w.domain === domain ? { ...w, band: data.risk?.band, score: data.risk?.score, ts, loading: false, history: loadHist(domain) } : w)));
    } catch (e: any) {
      setItems((prev) => prev.map((w) => (w.domain === domain ? { ...w, loading: false, error: e.message } : w)));
    }
  }, []);

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const d = normalizeDomain(input);
    if (!d) { setErr("Enter a valid site, e.g. example.com"); return; }
    if (items.some((w) => w.domain === d)) { setErr("Already in your watchlist."); return; }
    setErr("");
    setInput("");
    const next = [...items, { domain: d, history: loadHist(d) }];
    persist(next);
    check(d);
  };

  const remove = (domain: string) => {
    localStorage.removeItem(histKey(domain));
    persist(items.filter((w) => w.domain !== domain));
  };

  const checkAll = async () => {
    setCheckingAll(true);
    for (const w of items) await check(w.domain);
    setCheckingAll(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Monitoring <span className="gradient-text">Dashboard</span></h1>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button className="btn-ghost text-sm" onClick={() => window.print()}><Download className="h-4 w-4" /> PDF</button>
          <button className="btn text-sm" onClick={checkAll} disabled={checkingAll || items.length === 0}>
            <RefreshCw className={`h-4 w-4 ${checkingAll ? "animate-spin" : ""}`} /> {checkingAll ? "Checking…" : "Check all"}
          </button>
        </div>
      </div>

      <p className="max-w-2xl text-sm text-ink-secondary no-print">
        Keep a list of websites and re-check their credibility-risk score over time. Add a site, press
        <span className="text-ink"> Check all</span>, and each run adds a point to its trend line so you can
        see if it’s getting riskier.
      </p>

      {/* Add bar */}
      <form onSubmit={add} className="no-print">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary" />
            <input
              value={input}
              onChange={(e) => { setInput(e.target.value); setErr(""); }}
              placeholder="Add a site to monitor - e.g. example.com"
              className="w-full rounded-xl border border-white/15 bg-bg-card py-3 pl-9 pr-4 text-base outline-none transition focus:border-brand"
            />
          </div>
          <button type="submit" className="btn shrink-0"><Plus className="h-4 w-4" /> Add</button>
        </div>
        {err && <p className="mt-2 text-sm text-risk-high">{err}</p>}
        <p className="mt-2 text-xs text-ink-secondary">Your watchlist is saved in this browser. Each check records a point for the trend line.</p>
      </form>

      {items.length === 0 ? (
        <div className="card text-center text-sm text-ink-secondary">
          No sites yet - add one above to start monitoring. Want scheduled checks that alert you automatically?
          See <Link href="/about" className="text-brand-soft">About</Link>.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => {
            const band = (w.band as RiskBand) || "UNKNOWN";
            const c = bandColor(band);
            return (
              <div key={w.domain} className="card">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="truncate font-semibold">{w.domain}</div>
                  <div className="flex items-center gap-1 no-print">
                    <Link href={`/report?url=${encodeURIComponent(w.domain)}`} className="rounded p-1 text-brand-soft hover:bg-white/5" title="Full report"><ExternalLink className="h-4 w-4" /></Link>
                    <button onClick={() => check(w.domain)} className="rounded p-1 text-ink-secondary hover:bg-white/5 hover:text-white" title="Re-check"><RefreshCw className={`h-4 w-4 ${w.loading ? "animate-spin" : ""}`} /></button>
                    <button onClick={() => remove(w.domain)} className="rounded p-1 text-ink-secondary hover:bg-white/5 hover:text-risk-high" title="Remove"><X className="h-4 w-4" /></button>
                  </div>
                </div>
                {w.loading && !w.band ? (
                  <div className="flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin text-brand-soft" /> Checking…</div>
                ) : w.error ? (
                  <p className="text-sm text-risk-high">{w.error}</p>
                ) : w.band ? (
                  <>
                    <div className={`mb-2 inline-flex items-center gap-2 rounded-lg border ${c.border} ${c.bg} px-2 py-1 text-sm`}>
                      <span className={`font-semibold ${c.text}`}>{bandLabel(band)}</span>
                      <span className="text-ink-secondary">{w.score}/100</span>
                    </div>
                    <Sparkline points={w.history} />
                    <div className="mt-1 text-xs text-ink-secondary">Checked {fmtDate(w.ts)} · {w.history.length} point(s)</div>
                  </>
                ) : (
                  <p className="text-sm text-ink-secondary">Not checked yet.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
