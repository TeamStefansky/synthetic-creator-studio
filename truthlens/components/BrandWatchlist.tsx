"use client";

// Brand-mentions watchlist for the Monitor. Mirrors the domain watchlist UX but
// tracks how many public mentions a brand/term gets over time (via /api/mentions),
// with a trend sparkline and a "rising" flag when volume jumps. Browser-local
// (localStorage), like the domain watchlist. Public data only; a mention is an
// account/outlet, never a private individual.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Globe, RefreshCw, Plus, X, ExternalLink, Loader2, TrendingUp } from "lucide-react";
import { fmtDate } from "@/lib/ui";

interface Point { ts: string; count: number }
interface Term {
  term: string;
  total?: number;
  topCountry?: string;
  ts?: string;
  loading?: boolean;
  error?: string;
  history: Point[];
}

const LIST_KEY = "tl:brandwatch";
const histKey = (t: string) => `tl:bhist:${t.toLowerCase()}`;

function loadList(): string[] {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || "[]"); } catch { return []; }
}
function saveList(list: string[]) { localStorage.setItem(LIST_KEY, JSON.stringify(list)); }
function loadHist(t: string): Point[] {
  try { return JSON.parse(localStorage.getItem(histKey(t)) || "[]"); } catch { return []; }
}
function saveHist(t: string, h: Point[]) { localStorage.setItem(histKey(t), JSON.stringify(h.slice(-60))); }

// Rising when the latest count is a clear jump over the previous check.
function isRising(h: Point[]): boolean {
  if (h.length < 2) return false;
  const last = h[h.length - 1].count, prev = h[h.length - 2].count;
  return prev >= 1 && last >= Math.ceil(prev * 1.5);
}

function CountSparkline({ points }: { points: Point[] }) {
  const counts = points.map((p) => p.count);
  if (counts.length < 2) return <div className="h-8 text-xs text-ink-muted">no history yet</div>;
  const W = 180, H = 32, max = Math.max(1, ...counts);
  const step = W / (counts.length - 1);
  const path = counts.map((c, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(H - (c / max) * H).toFixed(1)}`).join(" ");
  const last = counts[counts.length - 1];
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={path} fill="none" stroke="#A98BF0" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={(counts.length - 1) * step} cy={H - (last / max) * H} r={2.5} fill="#A98BF0" />
    </svg>
  );
}

export default function BrandWatchlist() {
  const [items, setItems] = useState<Term[]>([]);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);

  useEffect(() => {
    setItems(loadList().map((t) => ({ term: t, history: loadHist(t) })));
  }, []);

  const persist = useCallback((next: Term[]) => {
    setItems(next);
    saveList(next.map((w) => w.term));
  }, []);

  const check = useCallback(async (term: string) => {
    setItems((prev) => prev.map((w) => (w.term === term ? { ...w, loading: true, error: undefined } : w)));
    try {
      const r = await fetch(`/api/mentions?entity=${encodeURIComponent(term)}`);
      const txt = await r.text();
      let data: any = {};
      try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: txt.slice(0, 160) || "Non-JSON response" }; }
      if (!r.ok) throw new Error(data.error || `Scan failed (${r.status})`);
      const ts = new Date().toISOString();
      const hist = loadHist(term);
      hist.push({ ts, count: data.total || 0 });
      saveHist(term, hist);
      const topCountry = data.byCountry?.[0]?.label;
      setItems((prev) => prev.map((w) => (w.term === term ? { ...w, total: data.total, topCountry, ts, loading: false, history: loadHist(term) } : w)));
    } catch (e: any) {
      setItems((prev) => prev.map((w) => (w.term === term ? { ...w, loading: false, error: e.message } : w)));
    }
  }, []);

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = input.trim();
    if (t.length < 2) { setErr("Enter a brand or term (2+ characters)."); return; }
    if (items.some((w) => w.term.toLowerCase() === t.toLowerCase())) { setErr("Already in your brand watchlist."); return; }
    setErr(""); setInput("");
    const next = [...items, { term: t, history: loadHist(t) }];
    persist(next);
    check(t);
  };

  const remove = (term: string) => {
    localStorage.removeItem(histKey(term));
    persist(items.filter((w) => w.term !== term));
  };

  const checkAll = async () => {
    setCheckingAll(true);
    for (const w of items) await check(w.term);
    setCheckingAll(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-brand-soft" />
          <h2 className="font-display text-xl font-bold">Brand <span className="gradient-text">mentions</span> watch</h2>
        </div>
        <button className="btn text-sm no-print" onClick={checkAll} disabled={checkingAll || items.length === 0}>
          <RefreshCw className={`h-4 w-4 ${checkingAll ? "animate-spin" : ""}`} /> {checkingAll ? "Checking…" : "Check all"}
        </button>
      </div>

      <p className="max-w-2xl text-sm text-ink-secondary no-print">
        Track how often a brand or term appears across public sources over time. Add a term, press
        <span className="text-ink"> Check all</span>, and each run records the mention count so you can
        spot a spike. Open the full view for the world map and every appearance.
      </p>

      <form onSubmit={add} className="no-print">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setErr(""); }}
            placeholder="Add a brand or term to watch - e.g. Acme Corp"
            className="w-full rounded-xl border border-white/15 bg-bg-card px-4 py-3 text-base outline-none transition focus:border-brand"
          />
          <button type="submit" className="btn shrink-0"><Plus className="h-4 w-4" /> Add</button>
        </div>
        {err && <p className="mt-2 text-sm text-risk-high">{err}</p>}
      </form>

      {items.length === 0 ? (
        <div className="card text-center text-sm text-ink-secondary">
          No brands yet - add one above to track where and how often it appears.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => (
            <div key={w.term} className="card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="truncate font-semibold">{w.term}</div>
                <div className="flex items-center gap-1 no-print">
                  <Link href={`/tools/mentions?entity=${encodeURIComponent(w.term)}`} className="rounded p-1 text-brand-soft hover:bg-white/5" title="Full view (map + appearances)"><ExternalLink className="h-4 w-4" /></Link>
                  <button onClick={() => check(w.term)} className="rounded p-1 text-ink-secondary hover:bg-white/5 hover:text-white" title="Re-check"><RefreshCw className={`h-4 w-4 ${w.loading ? "animate-spin" : ""}`} /></button>
                  <button onClick={() => remove(w.term)} className="rounded p-1 text-ink-secondary hover:bg-white/5 hover:text-risk-high" title="Remove"><X className="h-4 w-4" /></button>
                </div>
              </div>
              {w.loading && w.total === undefined ? (
                <div className="flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin text-brand-soft" /> Scanning…</div>
              ) : w.error ? (
                <p className="text-sm text-risk-high">{w.error}</p>
              ) : w.total !== undefined ? (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-2xl font-bold">{w.total}</span>
                    <span className="text-sm text-ink-secondary">mentions</span>
                    {isRising(w.history) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-risk-high/40 bg-risk-high/10 px-2 py-0.5 text-xs text-risk-high">
                        <TrendingUp className="h-3 w-3" /> rising
                      </span>
                    )}
                  </div>
                  <CountSparkline points={w.history} />
                  <div className="mt-1 text-xs text-ink-secondary">
                    {w.topCountry ? <>top: {w.topCountry} · </> : null}checked {fmtDate(w.ts)} · {w.history.length} point(s)
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-secondary">Not checked yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
