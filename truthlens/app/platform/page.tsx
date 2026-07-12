"use client";

// Stage 6 — Narrative Intelligence dashboard.
// Overview · Narratives · Campaigns · Profiles · Alerts, driven by the
// narrative-intel API through the /api/platform proxy. Degrades gracefully when
// the platform backend isn't connected (NARRATIVE_API_URL unset).

import { useCallback, useEffect, useState } from "react";
import {
  Radar, Play, RefreshCw, AlertTriangle, Users, Network, MessageSquareText,
  Activity, Bell, FileText, Loader2, PlugZap, ExternalLink, Search,
} from "lucide-react";
import { apiGet, apiPost, apiDelete, reportUrl, PlatformUnavailable } from "@/lib/platform";

type Tab = "overview" | "narratives" | "campaigns" | "profiles" | "alerts";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "narratives", label: "Narratives", icon: MessageSquareText },
  { id: "campaigns", label: "Campaigns", icon: Network },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "alerts", label: "Alerts", icon: Bell },
];

function manipColor(v?: number) {
  const n = v ?? 0;
  return n >= 66 ? "text-risk-high" : n >= 36 ? "text-risk-unknown" : "text-risk-legit";
}
function authColor(v?: number) {
  const n = v ?? 100;
  return n <= 34 ? "text-risk-high" : n <= 65 ? "text-risk-unknown" : "text-risk-legit";
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone || "text-white"}`}>{value}</div>
    </div>
  );
}

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function PlatformPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [narratives, setNarratives] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [authors, setAuthors] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [h, n, c, a, al] = await Promise.all([
        apiGet("health"),
        apiGet("narratives"),
        apiGet("campaigns"),
        apiGet("authors?limit=100"),
        apiGet("alerts"),
      ]);
      setHealth(h); setNarratives(n); setCampaigns(c); setAuthors(a); setAlerts(al);
      setUnavailable(null);
    } catch (e) {
      if (e instanceof PlatformUnavailable) setUnavailable(e.reason);
      else setUnavailable((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setRunning(`Detecting “${q}” across sources…`);
    try {
      await apiPost(`search?query=${encodeURIComponent(q)}`);
      setActiveQuery(q);
      await refresh();
    } catch (e) {
      if (e instanceof PlatformUnavailable) setUnavailable(e.reason);
    } finally {
      setRunning(null);
    }
  }, [query, refresh]);

  const runPipeline = useCallback(async () => {
    setRunning("Running full pipeline…");
    try {
      setRunning("Ingesting sources…");     await apiPost("ingest/run");
      setRunning("Scoring authenticity…");  await apiPost("authenticity/run");
      setRunning("Detecting coordination…");await apiPost("coordination/run");
      setRunning("Clustering narratives…"); await apiPost("narratives/run");
      setRunning("Evaluating alerts…");     await apiPost("alerts/evaluate");
      await refresh();
    } catch (e) {
      if (e instanceof PlatformUnavailable) setUnavailable(e.reason);
    } finally {
      setRunning(null);
    }
  }, [refresh]);

  const suspicious = authors.filter((a) => (a.authenticity_score ?? 100) <= 40);
  const topNarr = [...narratives].sort((a, b) => (b.manipulation_index ?? 0) - (a.manipulation_index ?? 0));

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow">
              <Radar className="h-5 w-5 text-white" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white">Narrative Intelligence</h1>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-400">
            Media monitoring across sources: authenticity of accounts, coordinated
            campaigns, narratives &amp; sentiment, and alerts. Indicators with evidence — not verdicts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runPipeline}
            disabled={!!running || !!unavailable}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02] disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running || "Run pipeline"}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/[0.04]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {unavailable && (
        <div className="card border-amber-500/30 bg-amber-500/[0.06]">
          <div className="flex items-start gap-3">
            <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <div className="font-semibold text-amber-200">Platform backend not connected</div>
              <p className="mt-1 text-sm text-amber-100/80">{unavailable}</p>
              <p className="mt-2 text-xs text-amber-100/60">
                Set <code className="rounded bg-black/30 px-1">NARRATIVE_API_URL</code> (and optional{" "}
                <code className="rounded bg-black/30 px-1">NARRATIVE_API_KEY</code>) to the deployed{" "}
                <code className="rounded bg-black/30 px-1">narrative-intel</code> service. It runs on SQLite + mock data with zero config.
              </p>
            </div>
          </div>
        </div>
      )}

      {!unavailable && (
        <>
          <div className="card">
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Search className="h-4 w-4 text-brand-soft" /> Detect keywords across sources
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                placeholder="e.g. election fraud, vaccine, brand name…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-brand"
              />
              <button
                onClick={runSearch}
                disabled={!!running || query.trim().length < 2}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02] disabled:opacity-50"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Detect
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Searches news, web &amp; GDELT for free; X/Twitter &amp; Telegram when their API keys are set on the backend.
              {activeQuery && <> · Showing results for <span className="text-brand-soft">“{activeQuery}”</span></>}
            </p>
          </div>

          <nav className="flex flex-wrap gap-1 border-b border-white/[0.07]">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm transition ${
                  tab === id ? "border-b-2 border-brand text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
                {id === "alerts" && alerts.length > 0 && (
                  <span className="rounded-full bg-risk-high/20 px-1.5 text-xs text-risk-high">{alerts.length}</span>
                )}
              </button>
            ))}
          </nav>

          {loading && !health ? (
            <div className="flex items-center gap-2 py-16 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading platform data…
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label="Posts ingested" value={health?.posts ?? 0} />
                    <Stat label="Accounts tracked" value={health?.authors ?? 0} />
                    <Stat label="Narratives" value={narratives.length} />
                    <Stat label="Campaigns" value={campaigns.length} tone={campaigns.length ? "text-risk-high" : "text-white"} />
                  </div>
                  {narratives.length === 0 && campaigns.length === 0 && (
                    <div className="card text-sm text-gray-400">
                      No analysis yet. Click <span className="font-semibold text-white">Run pipeline</span> to ingest the
                      mock sources and populate authenticity, coordination, narratives and alerts.
                    </div>
                  )}
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="card">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                        <MessageSquareText className="h-4 w-4 text-brand-soft" /> Top narratives by manipulation
                      </h3>
                      <div className="space-y-3">
                        {topNarr.slice(0, 5).map((n) => (
                          <div key={n.id}>
                            <div className="flex items-center justify-between text-sm">
                              <span className="truncate text-gray-200">{n.label}</span>
                              <span className={`ml-2 font-semibold ${manipColor(n.manipulation_index)}`}>
                                {Math.round(n.manipulation_index ?? 0)}
                              </span>
                            </div>
                            <Bar value={n.manipulation_index ?? 0} tone={
                              (n.manipulation_index ?? 0) >= 66 ? "bg-risk-high" : (n.manipulation_index ?? 0) >= 36 ? "bg-risk-unknown" : "bg-risk-legit"} />
                          </div>
                        ))}
                        {!topNarr.length && <p className="text-sm text-gray-500">—</p>}
                      </div>
                    </div>
                    <div className="card">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                        <AlertTriangle className="h-4 w-4 text-risk-high" /> Recent alerts
                      </h3>
                      <div className="space-y-2">
                        {alerts.slice(0, 6).map((a) => (
                          <div key={a.id} className="flex items-start gap-2 text-sm">
                            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk-unknown" />
                            <span className="text-gray-300">{a.title || a.body || a.type}</span>
                          </div>
                        ))}
                        {!alerts.length && <p className="text-sm text-gray-500">No alerts.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "narratives" && (
                <div className="grid gap-4 md:grid-cols-2">
                  {topNarr.map((n) => (
                    <div key={n.id} className="card">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-white">{n.label}</h3>
                        <a href={reportUrl("narrative", n.id)} target="_blank" rel="noopener noreferrer"
                           className="flex shrink-0 items-center gap-1 text-xs text-brand-soft hover:underline">
                          <FileText className="h-3.5 w-3.5" /> Report
                        </a>
                      </div>
                      {n.summary && <p className="mt-2 text-sm text-gray-400">{n.summary}</p>}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(n.keywords || []).slice(0, 6).map((k: string) => (
                          <span key={k} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-gray-300">{k}</span>
                        ))}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                        <div><div className="text-gray-500">Posts</div><div className="font-semibold text-white">{n.post_count}</div></div>
                        <div><div className="text-gray-500">Accounts</div><div className="font-semibold text-white">{n.account_count}</div></div>
                        <div><div className="text-gray-500">Manipulation</div><div className={`font-semibold ${manipColor(n.manipulation_index)}`}>{Math.round(n.manipulation_index ?? 0)}</div></div>
                      </div>
                    </div>
                  ))}
                  {!narratives.length && <p className="text-sm text-gray-500">No narratives yet — run the pipeline.</p>}
                </div>
              )}

              {tab === "campaigns" && (
                <div className="space-y-3">
                  {campaigns.map((c) => (
                    <div key={c.id} className="card">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-bold ${
                            c.coordination_score >= 66 ? "bg-risk-high/15 text-risk-high" : "bg-risk-unknown/15 text-risk-unknown"}`}>
                            {Math.round(c.coordination_score)}
                          </span>
                          <div>
                            <div className="font-semibold text-white">Coordinated Campaign #{c.id}</div>
                            <div className="text-xs text-gray-500">
                              {c.account_count} accounts · {c.post_count} posts · {(c.sources || []).join(", ")}
                            </div>
                          </div>
                        </div>
                        <a href={reportUrl("campaign", c.id)} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-brand-soft hover:bg-white/[0.04]">
                          <FileText className="h-3.5 w-3.5" /> Forensic report <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {c.sample_text && (
                        <blockquote className="mt-3 border-l-2 border-white/10 pl-3 text-sm text-gray-400">
                          “{c.sample_text}”
                        </blockquote>
                      )}
                    </div>
                  ))}
                  {!campaigns.length && <p className="text-sm text-gray-500">No coordinated campaigns detected — run the pipeline.</p>}
                </div>
              )}

              {tab === "profiles" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    {suspicious.length} of {authors.length} accounts scored low authenticity (≤40).
                    Lower authenticity = more bot-like indicators.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr className="border-b border-white/[0.07]">
                          <th className="py-2 pr-4">Account</th><th className="pr-4">Source</th>
                          <th className="pr-4">Authenticity</th><th>Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...authors].sort((a, b) => (a.authenticity_score ?? 100) - (b.authenticity_score ?? 100)).slice(0, 40).map((a) => (
                          <tr key={a.id} className="border-b border-white/[0.04]">
                            <td className="py-2 pr-4 text-gray-200">{a.handle || a.display_name || `#${a.id}`}</td>
                            <td className="pr-4 text-gray-500">{a.source}</td>
                            <td className={`pr-4 font-semibold ${authColor(a.authenticity_score)}`}>
                              {a.authenticity_score ?? "—"}
                            </td>
                            <td className="w-40"><Bar value={a.authenticity_score ?? 0} tone={
                              (a.authenticity_score ?? 100) <= 34 ? "bg-risk-high" : (a.authenticity_score ?? 100) <= 65 ? "bg-risk-unknown" : "bg-risk-legit"} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!authors.length && <p className="mt-3 text-sm text-gray-500">No accounts yet — run the pipeline.</p>}
                  </div>
                </div>
              )}

              {tab === "alerts" && <AlertsTab alerts={alerts} onChange={refresh} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AlertsTab({ alerts, onChange }: { alerts: any[]; onChange: () => void }) {
  const [rules, setRules] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("high_manipulation");
  const [busy, setBusy] = useState(false);

  const loadRules = useCallback(() => { apiGet("alerts/rules").then(setRules).catch(() => {}); }, []);
  useEffect(() => { loadRules(); }, [loadRules]);

  const addRule = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiPost("alerts/rules", { name: name.trim(), type, threshold: 0, channel: "inapp" });
      setName(""); loadRules();
    } finally { setBusy(false); }
  };
  const removeRule = async (id: number) => { await apiDelete(`alerts/rules/${id}`); loadRules(); };
  const evaluate = async () => { setBusy(true); try { await apiPost("alerts/evaluate"); onChange(); } finally { setBusy(false); } };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card">
        <h3 className="mb-3 font-semibold text-white">Alert rules</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand" />
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand">
            <option value="high_manipulation">High manipulation</option>
            <option value="new_campaign">New campaign</option>
            <option value="volume_spike">Volume spike</option>
            <option value="entity_mention">Entity mention</option>
          </select>
          <button onClick={addRule} disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-soft disabled:opacity-50">Add</button>
        </div>
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
              <span className="text-gray-200">{r.name} <span className="text-gray-500">· {r.type}</span></span>
              <button onClick={() => removeRule(r.id)} className="text-xs text-risk-high hover:underline">delete</button>
            </div>
          ))}
          {!rules.length && <p className="text-sm text-gray-500">No rules. Add one, then evaluate.</p>}
        </div>
        <button onClick={evaluate} disabled={busy}
          className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-white/[0.04]">
          <Activity className="h-4 w-4" /> Evaluate rules now
        </button>
      </div>
      <div className="card">
        <h3 className="mb-3 font-semibold text-white">Alerts fired</h3>
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="rounded-lg border border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-gray-200">
                <Bell className="h-3.5 w-3.5 text-risk-unknown" /> {a.title || a.type}
              </div>
              {a.body && <p className="mt-1 text-xs text-gray-500">{a.body}</p>}
            </div>
          ))}
          {!alerts.length && <p className="text-sm text-gray-500">No alerts fired yet.</p>}
        </div>
      </div>
    </div>
  );
}
