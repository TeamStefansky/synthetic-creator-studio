"use client";

// Brand Watch — in-app, runs entirely on this deployment (no external backend).
// Enter a brand / client / product / keyword → live indicators of whether it is
// the target of a coordinated disinformation attack. Indicators with evidence
// and an alternative explanation — never a verdict.

import { useCallback, useEffect, useState } from "react";
import {
  ShieldAlert, ShieldCheck, ShieldQuestion, Search, Loader2, RefreshCw,
  TrendingUp, Radar, HelpCircle,
} from "lucide-react";

interface Indicator {
  key: string; label: string; level: "Low" | "Medium" | "High" | "Unknown";
  score: number; confidence: number; signals: string[]; alternative: string; detail: string;
}
interface SourceStatus { source: string; connected: boolean; reason?: string; count: number; error?: string; }
interface Mention { source: string; text: string; url?: string; account?: string; timestamp?: string; }
interface ThreatResult {
  entity: string; score: number | null; status: string; totalMentions: number; totalAccounts: number;
  sources: SourceStatus[]; indicators: Indicator[]; evidence: Mention[]; trend: { ts: string; count: number }[];
  rubricVersion: string; generatedAt: string; note?: string; cached?: boolean;
}

const STATUS_UI: Record<string, { label: string; tone: string; bar: string; border: string; icon: any }> = {
  UNDER_ATTACK: { label: "Under attack", tone: "text-risk-high", bar: "bg-risk-high", border: "border-risk-high/40", icon: ShieldAlert },
  ELEVATED: { label: "Elevated", tone: "text-risk-unknown", bar: "bg-risk-unknown", border: "border-risk-unknown/40", icon: ShieldQuestion },
  CALM: { label: "Calm", tone: "text-risk-legit", bar: "bg-risk-legit", border: "border-risk-legit/40", icon: ShieldCheck },
  UNKNOWN: { label: "Unknown", tone: "text-gray-400", bar: "bg-gray-500", border: "border-white/10", icon: HelpCircle },
};

const LEVEL_TONE: Record<string, string> = {
  High: "text-risk-high bg-risk-high/10", Medium: "text-risk-unknown bg-risk-unknown/10",
  Low: "text-risk-legit bg-risk-legit/10", Unknown: "text-gray-400 bg-white/[0.05]",
};

export default function BrandWatchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ThreatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [activeEntity, setActiveEntity] = useState<string | null>(null);

  const scan = useCallback(async (entity: string, silent = false) => {
    if (entity.length < 2) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brandwatch?entity=${encodeURIComponent(entity)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Scan failed");
      setResult(data);
      setActiveEntity(entity);
    } catch (e: any) {
      setError(e?.message || "Scan failed");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auto || !activeEntity) return;
    const id = setInterval(() => { if (!loading) scan(activeEntity, true); }, 90_000);
    return () => clearInterval(id);
  }, [auto, activeEntity, loading, scan]);

  const ui = result ? (STATUS_UI[result.status] || STATUS_UI.UNKNOWN) : null;
  const Icon = ui?.icon;

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow">
              <Radar className="h-5 w-5 text-white" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white">Brand Watch</h1>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-400">
            Enter a brand, client, product, or keyword to see live indicators of a coordinated
            disinformation attack across public sources. Indicators with evidence — not a verdict.
          </p>
        </div>
        {activeEntity && (
          <button onClick={() => setAuto((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 transition hover:text-gray-300"
            title="Toggle auto-refresh (90s)">
            <span className={`h-1.5 w-1.5 rounded-full ${auto ? "animate-pulse bg-risk-legit" : "bg-gray-600"}`} />
            {auto ? "Live · auto-refresh on" : "Auto-refresh off"}
          </button>
        )}
      </header>

      <div className="card">
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") scan(query.trim()); }}
            placeholder="Enter a brand, client, product, or keyword…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-brand"
          />
          <button
            onClick={() => scan(query.trim())}
            disabled={loading || query.trim().length < 2}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Scan
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Free public sources (GDELT, Bluesky, Hacker News, Reddit) run with no key; news APIs (Guardian,
          NYT, GNews, NewsAPI) and RSS activate when configured — unconfigured ones show as “not connected.”
        </p>
      </div>

      {error && (
        <div className="card border-risk-high/40 bg-risk-high/[0.06] text-sm text-risk-high">{error}</div>
      )}

      {result && ui && (
        <>
          {/* Status + score */}
          <div className={`card ${ui.border}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] ${ui.tone}`}>
                  {Icon && <Icon className="h-6 w-6" />}
                </span>
                <div>
                  <div className="text-lg font-bold text-white">{result.entity}</div>
                  <div className={`text-sm font-semibold uppercase tracking-wide ${ui.tone}`}>{ui.label}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-4xl font-black ${ui.tone}`}>
                  {result.score === null ? "—" : result.score}
                  {result.score !== null && <span className="text-lg text-gray-600">/100</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {result.totalMentions} mentions · {result.totalAccounts} accounts
                </div>
              </div>
            </div>
            {result.note && <p className="mt-3 text-sm text-gray-400">{result.note}</p>}
          </div>

          {/* Sources — connected vs not connected (never faked) */}
          <div className="card">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Radar className="h-4 w-4 text-brand-soft" /> Sources
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.sources.map((s) => (
                <span key={s.source}
                  title={s.connected ? (s.error ? `error: ${s.error}` : `${s.count} mentions`) : (s.reason || "not connected")}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    !s.connected ? "border-white/10 bg-white/[0.03] text-gray-500"
                      : s.error ? "border-risk-unknown/30 bg-risk-unknown/[0.06] text-risk-unknown"
                      : "border-risk-legit/30 bg-risk-legit/[0.06] text-risk-legit"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${!s.connected ? "bg-gray-600" : s.error ? "bg-risk-unknown" : "bg-risk-legit"}`} />
                  {s.source}
                  {!s.connected ? <span className="text-gray-600">· not connected</span>
                    : <span className="text-gray-500">{s.count}</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Indicators — each with level + signals + alternative */}
          <div className="card">
            <h3 className="mb-4 font-semibold text-white">Indicators</h3>
            <div className="space-y-4">
              {result.indicators.map((i) => (
                <div key={i.key} className="border-b border-white/[0.05] pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-200">{i.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_TONE[i.level]}`}>
                      {i.level}{i.level !== "Unknown" && ` · ${i.score}`}
                    </span>
                  </div>
                  {i.level !== "Unknown" && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={`h-full rounded-full ${i.score >= 66 ? "bg-risk-high" : i.score >= 34 ? "bg-risk-unknown" : "bg-risk-legit"}`}
                        style={{ width: `${Math.max(2, i.score)}%`, opacity: 0.4 + i.confidence * 0.6 }} />
                    </div>
                  )}
                  <ul className="mt-2 space-y-0.5">
                    {i.signals.map((sig, k) => <li key={k} className="text-xs text-gray-400">• {sig}</li>)}
                  </ul>
                  <p className="mt-1.5 text-xs text-gray-500">
                    <span className="text-gray-600">Could also be explained by:</span> {i.alternative}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {result.trend.length > 1 && (
              <div className="card">
                <h3 className="mb-3 flex items-center gap-1.5 font-semibold text-white">
                  <TrendingUp className="h-4 w-4 text-brand-soft" /> Volume over time
                </h3>
                <div className="flex h-16 items-end gap-0.5">
                  {result.trend.map((t, i) => {
                    const max = Math.max(1, ...result.trend.map((x) => x.count));
                    return <div key={i} title={`${t.ts}: ${t.count}`} className="flex-1 rounded-t bg-brand-soft/60"
                      style={{ height: `${Math.max(4, (t.count / max) * 100)}%` }} />;
                  })}
                </div>
              </div>
            )}
            <div className="card">
              <h3 className="mb-3 font-semibold text-white">
                Evidence <span className="text-xs font-normal text-gray-500">— earliest observed in collected data, not proof of origin</span>
              </h3>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {result.evidence.map((e, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
                    <p className="text-gray-300">{e.text}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span className="rounded bg-white/[0.06] px-1.5">{e.source}</span>
                      {e.account && <span>{e.account}</span>}
                      {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-brand-soft hover:underline">open ↗</a>}
                    </div>
                  </div>
                ))}
                {!result.evidence.length && <p className="text-sm text-gray-500">No evidence captured.</p>}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-600">
            Decision-support tool — not a verdict. Indicators of a coordinated inauthentic campaign, with
            evidence and alternative explanations — never an accusation against any person. Rubric {result.rubricVersion}.
            {result.cached && " · cached (≤90s)"}
          </p>
        </>
      )}
    </div>
  );
}
