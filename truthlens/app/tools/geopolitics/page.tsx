"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe2, ExternalLink, AlertTriangle, TrendingUp } from "lucide-react";
import Disclaimer from "@/components/Disclaimer";
import type { GeopoliticsAggregate } from "@/lib/geopolitics-agg";
import type { GeoRecord } from "@/lib/geopolitics";

// Geopolitics situational picture - real events + forecasts from the catalog's
// public geopolitics sources (server-side). Decision-support context, not a
// verdict; unconnected sources are shown honestly.

interface Result extends GeopoliticsAggregate { generatedAt: string }

const KIND_LABEL: Record<string, string> = {
  conflict: "Conflict", humanitarian: "Humanitarian", disaster: "Disaster", forecast: "Forecast",
};
const KIND_COLOR: Record<string, string> = {
  conflict: "#F0454F", humanitarian: "#E1804A", disaster: "#F5D742", forecast: "#A98BF0",
};

function fmt(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? (ts.length <= 10 ? ts : "") : d.toLocaleDateString();
}

export default function GeopoliticsPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [region, setRegion] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true); setError("");
      try {
        const r = await fetch("/api/geopolitics");
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load");
        setResult(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const events = useMemo(
    () => (result?.events || []).filter((e) => region === "all" || e.region === region),
    [result, region],
  );
  const forecasts = useMemo(
    () => (result?.forecasts || []).filter((e) => region === "all" || e.region === region),
    [result, region],
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Globe2 className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Geopolitics <span className="gradient-text">Situational Picture</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Real conflict, humanitarian, disaster and forecast signals from public sources - UCDP,
          ReliefWeb, USGS, NASA EONET, Polymarket, Metaculus (and ACLED with a key). Server-side,
          official endpoints only. Context for analysts, never a verdict.
        </p>
      </div>

      {loading && <div className="card text-sm text-ink-secondary">Loading situational picture…</div>}
      {error && <div className="card text-sm text-risk-high">{error}</div>}

      {result && (
        <div className="space-y-6">
          {/* source status + region filter */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-bold">{result.total} signals</div>
              <div className="flex flex-wrap gap-1.5">
                {[{ key: "all", label: "All regions" }, ...result.byRegion].map((r: any) => (
                  <button key={r.key} onClick={() => setRegion(r.key)}
                    data-active={region === r.key}
                    className="pill-seg rounded-full border border-line px-3 py-1 text-xs data-[active=true]:bg-bg-elev data-[active=true]:text-white">
                    {r.label}{typeof r.count === "number" ? ` · ${r.count}` : ""}
                  </button>
                ))}
              </div>
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

          <div className="grid gap-6 lg:grid-cols-2">
            {/* events */}
            <div className="card">
              <div className="label-muted mb-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Events (conflict · humanitarian · disaster)</div>
              {events.length === 0 ? (
                <p className="text-sm text-ink-secondary">No events in this region.</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {events.slice(0, 40).map((e: GeoRecord) => (
                    <li key={e.uid} className="py-2">
                      <div className="flex items-center gap-2 text-xs text-ink-secondary">
                        <span className="rounded px-1.5 py-0.5 font-mono uppercase" style={{ background: KIND_COLOR[e.kind] + "22", color: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind]}</span>
                        <span className="uppercase tracking-wide">{e.source}</span>
                        {e.country && <span>· {e.country}</span>}
                        {e.ts && <span>· {fmt(e.ts)}</span>}
                        {typeof e.score === "number" && e.scoreKind && (
                          <span className="ml-auto font-mono">{e.score} {e.scoreKind}</span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-ink">{e.title}</div>
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                          Open source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* forecasts */}
            <div className="card">
              <div className="label-muted mb-2 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Forecasts (market + community probabilities)</div>
              {forecasts.length === 0 ? (
                <p className="text-sm text-ink-secondary">No forecasts in this region.</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {forecasts.map((e: GeoRecord) => (
                    <li key={e.uid} className="py-2">
                      <div className="flex items-center gap-2">
                        {typeof e.score === "number" && (
                          <span className="w-12 shrink-0 font-mono text-sm font-bold text-brand-soft">{Math.round(e.score * 100)}%</span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm text-ink">{e.title}</div>
                          <div className="text-xs text-ink-secondary">
                            <span className="uppercase tracking-wide">{e.source}</span>
                            {e.url && (
                              <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-brand-soft hover:underline">
                                open <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
