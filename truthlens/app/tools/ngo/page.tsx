"use client";

import { useState } from "react";
import { HeartHandshake, ArrowRight, ExternalLink } from "lucide-react";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";
import type { NgoAggregate, NgoRecord } from "@/lib/ngo";

interface Result extends NgoAggregate { query: string; generatedAt: string }

function money(n?: number, currency?: string): string {
  if (typeof n !== "number") return "—";
  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "";
  if (Math.abs(n) >= 1e9) return `${sym}${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${sym}${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${sym}${(n / 1e3).toFixed(0)}K`;
  return `${sym}${n}`;
}

export default function NgoPage() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (value?: string) => {
    const query = value ?? q;
    if (query.trim().length < 2) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch(`/api/ngo?q=${encodeURIComponent(query)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Lookup failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Nonprofit <span className="gradient-text">Registry</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Look up nonprofits / NGOs in public regulatory registries - US IRS Form 990 (ProPublica
          Nonprofit Explorer) and the UK Charity Commission (with a key). Organization-level facts
          from public filings only: registration ID, classification, category and reported financials.
        </p>
      </div>

      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) search(); }} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Organization name, e.g. Red Cross"
            className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-3 text-base outline-none transition focus:border-brand"
          />
          <button type="submit" className="btn shrink-0" disabled={loading || q.trim().length < 2}>
            {loading ? "Searching…" : <>Search <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
        <p className="mt-2 text-xs text-ink-secondary">Public filings only. Organizations, never trustee/officer person records.</p>
      </div>

      {!result && !loading && (
        <ToolIntro
          heading="Nonprofit & NGO public records"
          what={<>Search regulatory registries for a nonprofit and see the <span className="text-ink">organization&rsquo;s</span> public filing facts - registration number, tax classification, activity category, and the latest reported revenue / expenses / assets - each linked to the source filing.</>}
          examplesLabel="Try it"
          examples={[{ label: "Search \"Red Cross\"", onClick: () => { setQ("Red Cross"); search("Red Cross"); } }]}
          legend={[
            { label: "US (IRS 990)", tone: "neutral", text: "ProPublica Nonprofit Explorer - keyless." },
            { label: "UK charities", tone: "unknown", text: "Charity Commission - set a key to enable." },
            { label: "Organizations only", tone: "neutral", text: "no trustee/officer person records." },
          ]}
          note="Financial figures are as filed with the regulator; classification/category are the registry's own, not a judgement."
        />
      )}

      {result && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-lg font-bold">{result.total} organization{result.total === 1 ? "" : "s"} for &ldquo;{result.query}&rdquo;</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.sources.map((s) => (
                <span key={s.source} title={s.connected ? (s.error || "") : (s.reason || "not connected")}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${s.connected ? "border-white/15 text-ink-secondary" : "border-yellow-500/30 bg-yellow-500/5 text-yellow-200/80"}`}>
                  {s.source}{s.connected ? ` · ${s.count}` : " · not connected"}
                </span>
              ))}
            </div>
          </div>

          {result.records.length === 0 ? (
            <div className="card text-sm text-ink-secondary">No organizations matched. Try the exact registered name.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {result.records.map((o: NgoRecord) => (
                <div key={o.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{o.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                        <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase tracking-wide">{o.country}</span>
                        {o.classification && <span>{o.classification}</span>}
                        {o.registrationId && <span className="font-mono">#{o.registrationId}</span>}
                        {(o.city || o.region) && <span>· {[o.city, o.region].filter(Boolean).join(", ")}</span>}
                      </div>
                    </div>
                    {o.url && (
                      <a href={o.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-brand-soft hover:underline" title="Open filing / register entry">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  {o.category && <div className="mt-2 text-xs text-ink-secondary">Category: <span className="text-ink">{o.category}</span></div>}
                  {(o.revenue !== undefined || o.expenses !== undefined || o.assets !== undefined) && (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-line py-1.5">
                        <div className="text-sm font-bold text-ink">{money(o.revenue, o.currency)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-ink-muted">Revenue</div>
                      </div>
                      <div className="rounded-lg border border-line py-1.5">
                        <div className="text-sm font-bold text-ink">{money(o.expenses, o.currency)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-ink-muted">Expenses</div>
                      </div>
                      <div className="rounded-lg border border-line py-1.5">
                        <div className="text-sm font-bold text-ink">{money(o.assets, o.currency)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-ink-muted">Assets</div>
                      </div>
                    </div>
                  )}
                  {o.fiscalYear && <div className="mt-1.5 text-[11px] text-ink-muted">As filed for FY {o.fiscalYear}{o.status ? ` · ${o.status}` : ""}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
