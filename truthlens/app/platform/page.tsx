"use client";

// Brand Watch - in-app, runs entirely on this deployment (no external backend).
// Enter a brand / client / product / keyword → live indicators of whether it is
// the target of a coordinated disinformation attack. Indicators with evidence
// and an alternative explanation - never a verdict.

import { useCallback, useEffect, useState } from "react";
import {
  ShieldAlert, ShieldCheck, ShieldQuestion, Search, Loader2, RefreshCw,
  TrendingUp, Radar, HelpCircle, FileText, Sparkles,
} from "lucide-react";
import ToolIntro from "@/components/ToolIntro";

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
  earliest?: Mention;
  narratives?: {
    available: boolean; reason?: string; assessment: string; coreClaims: string[];
    clusters: { label: string; summary: string; hostility: string; alternative: string }[];
  };
  archives?: { url: string; archiveUrl: string; status: "archived" | "requested"; timestamp?: string }[];
}

const HOST_TONE: Record<string, string> = {
  high: "text-risk-high bg-risk-high/10", medium: "text-risk-unknown bg-risk-unknown/10", low: "text-risk-legit bg-risk-legit/10",
};

const STATUS_UI: Record<string, { label: string; tone: string; bar: string; border: string; icon: any }> = {
  UNDER_ATTACK: { label: "Under attack", tone: "text-risk-high", bar: "bg-risk-high", border: "border-risk-high/40", icon: ShieldAlert },
  ELEVATED: { label: "Elevated", tone: "text-risk-unknown", bar: "bg-risk-unknown", border: "border-risk-unknown/40", icon: ShieldQuestion },
  CALM: { label: "Calm", tone: "text-risk-legit", bar: "bg-risk-legit", border: "border-risk-legit/40", icon: ShieldCheck },
  UNKNOWN: { label: "Unknown", tone: "text-ink-secondary", bar: "bg-gray-500", border: "border-white/10", icon: HelpCircle },
};

const LEVEL_TONE: Record<string, string> = {
  High: "text-risk-high bg-risk-high/10", Medium: "text-risk-unknown bg-risk-unknown/10",
  Low: "text-risk-legit bg-risk-legit/10", Unknown: "text-ink-secondary bg-white/[0.05]",
};

export default function BrandWatchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ThreatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [activeEntity, setActiveEntity] = useState<string | null>(null);
  const [watch, setWatch] = useState<{ connected: boolean; watches: any[]; alerts: any[]; reason?: string }>({ connected: false, watches: [], alerts: [] });

  const loadWatch = useCallback(async () => {
    try {
      const res = await fetch("/api/watch", { cache: "no-store" });
      setWatch(await res.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadWatch(); }, [loadWatch]);

  const addWatch = useCallback(async (name: string) => {
    await fetch(`/api/watch?name=${encodeURIComponent(name)}`, { method: "POST" });
    loadWatch();
  }, [loadWatch]);
  const removeWatch = useCallback(async (id: string) => {
    await fetch(`/api/watch?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    loadWatch();
  }, [loadWatch]);

  const scan = useCallback(async (entity: string, silent = false) => {
    if (entity.length < 2) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      // Manual scans run the deep LLM narrative layer; auto-refresh stays light.
      const res = await fetch(`/api/brandwatch?entity=${encodeURIComponent(entity)}${silent ? "" : "&deep=1"}`, { cache: "no-store" });
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
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-brand shadow-glow">
              <Radar className="h-5 w-5 text-white" />
            </span>
            <h1 className="font-display text-xl font-bold tracking-tight text-white">Brand <span className="gradient-text">Watch</span></h1>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-secondary">
            Enter a brand, client, product, or keyword to see live indicators of a coordinated
            disinformation attack across public sources. Indicators with evidence - not a verdict.
          </p>
        </div>
        {activeEntity && (
          <button onClick={() => setAuto((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-ink-secondary transition hover:text-ink"
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
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-brand"
          />
          <button
            onClick={() => scan(query.trim())}
            disabled={loading || query.trim().length < 2}
            className="flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Scan
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-secondary">
          Free public sources (GDELT, Bluesky, Hacker News, Reddit) run with no key; news APIs (Guardian,
          NYT, GNews, NewsAPI) and RSS activate when configured - unconfigured ones show as “not connected.”
        </p>
      </div>

      {/* First-run guidance - shown until the user runs their first scan */}
      {!result && !loading && !error && (
        <ToolIntro
          what={<>Type any <span className="text-ink">brand, company, product, public page, or topic</span> and press <span className="text-ink">Scan</span>. TruthLens pulls what’s being said about it across public sources right now and shows whether the pattern looks like an <span className="text-ink">organic conversation</span> or a <span className="text-ink">coordinated push</span> - with the evidence behind every signal. A decision-support tool, not a verdict.</>}
          examples={["Pfizer", "Tesla", "NATO", "OpenAI"].map((ex) => ({ label: ex, onClick: () => { setQuery(ex); scan(ex); } }))}
          legend={[
            { label: "Calm", tone: "legit", icon: <ShieldCheck className="h-4 w-4 text-risk-legit" />, text: "normal, organic chatter. No coordination signals." },
            { label: "Elevated", tone: "unknown", icon: <ShieldQuestion className="h-4 w-4 text-risk-unknown" />, text: "some signals worth a human look." },
            { label: "Under attack", tone: "high", icon: <ShieldAlert className="h-4 w-4 text-risk-high" />, text: "strong coordination pattern. Verify the evidence." },
            { label: "Unknown", tone: "neutral", icon: <HelpCircle className="h-4 w-4 text-ink-secondary" />, text: "not enough data to judge. Honestly says so." },
          ]}
          note="Every signal shows its evidence and an innocent alternative explanation. TruthLens never names a private individual and never claims who is behind a pattern."
        />
      )}

      {/* Watchlist - continuous monitoring */}
      {watch.connected ? (
        (watch.watches.length > 0 || (activeEntity && !watch.watches.some((w) => w.name === activeEntity))) && (
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Radar className="h-4 w-4 text-brand-soft" /> Watchlist
                <span className="text-xs font-normal text-ink-secondary">· monitored on a schedule</span>
              </h3>
              {activeEntity && !watch.watches.some((w) => w.name === activeEntity) && (
                <button onClick={() => addWatch(activeEntity)}
                  className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-brand-soft transition hover:bg-white/[0.04]">
                  ＋ Watch “{activeEntity}”
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {watch.watches.map((w) => {
                const wu = STATUS_UI[w.lastStatus] || STATUS_UI.UNKNOWN;
                return (
                  <span key={w.id} className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-2.5 pr-1.5 text-sm">
                    <span className={`h-2 w-2 rounded-full ${w.lastStatus ? wu.bar : "bg-gray-600"}`} title={w.lastStatus ? wu.label : "not checked yet"} />
                    <button onClick={() => { setQuery(w.name); scan(w.name); }} className="text-ink hover:text-white">{w.name}</button>
                    {typeof w.lastScore === "number" && <span className={`text-xs ${wu.tone}`}>{w.lastScore}</span>}
                    <button onClick={() => removeWatch(w.id)} title="Stop watching"
                      className="text-ink-muted opacity-0 transition group-hover:opacity-100 hover:text-risk-high">✕</button>
                  </span>
                );
              })}
              {!watch.watches.length && <p className="text-xs text-ink-secondary">No entities watched yet - scan one, then add it.</p>}
            </div>
            {watch.alerts.length > 0 && (
              <div className="mt-3 border-t border-white/[0.05] pt-3">
                <div className="mb-1 text-xs font-semibold text-ink-secondary">Recent escalation alerts</div>
                <div className="space-y-1">
                  {watch.alerts.slice(0, 4).map((a) => (
                    <div key={a.id} className="text-xs text-ink-secondary">🔔 {a.title}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : activeEntity ? (
        <div className="card border-white/10 text-xs text-ink-secondary">
          Continuous monitoring is <span className="text-ink-secondary">not connected</span>. {watch.reason}
        </div>
      ) : null}

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
                  {result.score === null ? " - " : result.score}
                  {result.score !== null && <span className="text-lg text-ink-muted">/100</span>}
                </div>
                <div className="text-xs text-ink-secondary">
                  {result.totalMentions} mentions · {result.totalAccounts} accounts
                </div>
                <a href={`/api/brandwatch/report?entity=${encodeURIComponent(result.entity)}`} target="_blank" rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                  <FileText className="h-3.5 w-3.5" /> Export report (PDF)
                </a>
              </div>
            </div>
            {result.note && <p className="mt-3 text-sm text-ink-secondary">{result.note}</p>}
          </div>

          {/* Earliest observable + Trace */}
          {result.earliest && (
            <div className="card">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Earliest observed <span className="font-normal text-ink-secondary"> - in collected data, not the true origin</span></h3>
                <a href={`/check?type=narrative&input=${encodeURIComponent(result.entity)}`}
                  className="text-xs text-brand-soft hover:underline">Trace to earliest observable →</a>
              </div>
              <p className="text-sm text-ink">{result.earliest.text}</p>
              <div className="mt-1 text-xs text-ink-secondary">
                {result.earliest.source}{result.earliest.account ? ` · ${result.earliest.account}` : ""}{result.earliest.timestamp ? ` · ${result.earliest.timestamp}` : ""}
                {result.earliest.url && <> · <a href={result.earliest.url} target="_blank" rel="noopener noreferrer" className="text-brand-soft hover:underline">source</a></>}
              </div>
            </div>
          )}

          {/* Sources - connected vs not connected (never faked) */}
          <div className="card">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Radar className="h-4 w-4 text-brand-soft" /> Sources
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.sources.map((s) => (
                <span key={s.source}
                  title={s.connected ? (s.error ? `error: ${s.error}` : `${s.count} mentions`) : (s.reason || "not connected")}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    !s.connected ? "border-white/10 bg-white/[0.03] text-ink-secondary"
                      : s.error ? "border-risk-unknown/30 bg-risk-unknown/[0.06] text-risk-unknown"
                      : "border-risk-legit/30 bg-risk-legit/[0.06] text-risk-legit"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${!s.connected ? "bg-gray-600" : s.error ? "bg-risk-unknown" : "bg-risk-legit"}`} />
                  {s.source}
                  {!s.connected ? <span className="text-ink-muted">· not connected</span>
                    : <span className="text-ink-secondary">{s.count}</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Indicators - each with level + signals + alternative */}
          <div className="card">
            <h3 className="mb-4 font-semibold text-white">Indicators</h3>
            <div className="space-y-4">
              {result.indicators.map((i) => (
                <div key={i.key} className="border-b border-white/[0.05] pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-ink">{i.label}</span>
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
                    {i.signals.map((sig, k) => <li key={k} className="text-xs text-ink-secondary">• {sig}</li>)}
                  </ul>
                  <p className="mt-1.5 text-xs text-ink-secondary">
                    <span className="text-ink-muted">Could also be explained by:</span> {i.alternative}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* AI narrative layer (deep scan) */}
          {result.narratives && (
            <div className="card">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <Sparkles className="h-4 w-4 text-brand-soft" /> Narrative analysis
                <span className="text-xs font-normal text-ink-secondary">· AI-assisted</span>
              </h3>
              {result.narratives.available ? (
                <>
                  {result.narratives.assessment && <p className="text-sm text-ink">{result.narratives.assessment}</p>}
                  {result.narratives.coreClaims.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-ink-secondary">Core claims circulating</div>
                      <ul className="mt-1 space-y-0.5">
                        {result.narratives.coreClaims.map((c, i) => <li key={i} className="text-sm text-ink">• {c}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {result.narratives.clusters.map((c, i) => (
                      <div key={i} className="rounded-lg border border-white/[0.06] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-ink">{c.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${HOST_TONE[c.hostility] || HOST_TONE.low}`}>{c.hostility}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-secondary">{c.summary}</p>
                        <p className="mt-1.5 text-xs text-ink-secondary"><span className="text-ink-muted">Could also be:</span> {c.alternative}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-ink-muted">AI-assisted interpretation - indicators, not verdicts. Verify against the evidence below.</p>
                </>
              ) : (
                <p className="text-sm text-ink-secondary">
                  <span className="text-ink-secondary">Not connected.</span> {result.narratives.reason}
                </p>
              )}
            </div>
          )}

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
                Evidence <span className="text-xs font-normal text-ink-secondary"> - earliest observed in collected data, not proof of origin</span>
              </h3>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {result.evidence.map((e, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
                    <p className="text-ink">{e.text}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink-secondary">
                      <span className="rounded bg-white/[0.06] px-1.5">{e.source}</span>
                      {e.account && <span>{e.account}</span>}
                      {(() => {
                        const arc = e.url ? (result.archives || []).find((a) => a.url === e.url) : undefined;
                        return arc ? (
                          <a href={arc.archiveUrl} target="_blank" rel="noopener noreferrer" className="text-ink-secondary hover:underline" title={arc.status === "archived" ? "Preserved snapshot (Wayback Machine)" : "Save requested - snapshot may still be processing"}>
                            {arc.status === "archived" ? "archived ↗" : "archive requested ↗"}
                          </a>
                        ) : null;
                      })()}
                      {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-brand-soft hover:underline">open ↗</a>}
                    </div>
                  </div>
                ))}
                {!result.evidence.length && <p className="text-sm text-ink-secondary">No evidence captured.</p>}
                {!!(result.archives && result.archives.length) && (
                  <p className="pt-1 text-[11px] text-ink-muted">
                    {result.archives.length} evidence URL(s) preserved via the Wayback Machine (deep scan) - so the record survives edits or deletion.
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-ink-muted">
            Decision-support tool - not a verdict. Indicators of a coordinated inauthentic campaign, with
            evidence and alternative explanations - never an accusation against any person. Rubric {result.rubricVersion}.
            {result.cached && " · cached (≤90s)"}
          </p>
        </>
      )}
    </div>
  );
}
