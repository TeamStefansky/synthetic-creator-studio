"use client";

// /check — one entry point for every check. Auto-detects the input type, lets the
// user override, runs the EXISTING tool's API (logic reused, not reimplemented),
// renders a confidence-badged summary, and auto-saves to history. The standalone
// tool routes still work unchanged.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Search, ExternalLink } from "lucide-react";
import ConfidenceBadge, { ConfidenceLevel } from "@/components/ConfidenceBadge";
import Disclaimer from "@/components/Disclaimer";
import { detectCheckType, CHECK_TYPES, CheckType } from "@/lib/check/detect";
import { CheckRecord, genId, getLocal, saveLocal, syncShared } from "@/lib/check/history";
import { extractEntities } from "@/lib/clues/extract";
import { linkAndRecord, connectionsFor, ClueConnection } from "@/lib/clues";
import { bandLabel } from "@/lib/ui";

const ENDPOINT: Record<CheckType, string> = {
  site: "/api/analyze", post: "/api/post-check", logs: "/api/logs",
  email: "/api/email-trace", narrative: "/api/brandwatch",
};
const TOOL_ROUTE: Record<CheckType, string> = {
  site: "/", post: "/tools/post", logs: "/tools/logs", email: "/tools/email", narrative: "/platform",
};

function bodyFor(type: CheckType, input: string): any {
  if (type === "site") return { url: input };
  if (type === "post") return /^https?:\/\//i.test(input) ? { url: input } : { text: input };
  if (type === "logs") return { log: input };
  return { raw: input };
}

function summarize(type: CheckType, r: any): { headline: string; level: ConfidenceLevel } {
  try {
    if (type === "narrative") {
      const lvl: ConfidenceLevel = r.status === "UNDER_ATTACK" ? "High" : r.status === "ELEVATED" ? "Medium"
        : r.status === "CALM" ? "Low" : "Unknown";
      const label = r.status === "UNDER_ATTACK" ? "Coordinated push likely" : r.status === "ELEVATED" ? "Elevated activity"
        : r.status === "CALM" ? "Organic-looking" : "Unknown / no signal";
      return { headline: `${label}${r.score != null ? ` · ${r.score}/100` : ""} · ${r.totalMentions} mentions`, level: lvl };
    }
    if (type === "site") {
      const lvl: ConfidenceLevel = r.band === "HIGH_RISK" ? "High" : r.band === "LIKELY_LEGITIMATE" ? "Low" : "Unknown";
      return { headline: `${bandLabel(r.band)}${typeof r.score === "number" ? ` · risk ${r.score}` : ""}`, level: lvl };
    }
    if (type === "logs") {
      const c = r.coordination || {};
      const lvl = (["Low", "Medium", "High"].includes(c.level) ? c.level : "Unknown") as ConfidenceLevel;
      return { headline: `Coordination ${c.level || "Unknown"}${r.analysis?.total ? ` · ${r.analysis.total} lines` : ""}`, level: lvl };
    }
    if (type === "email") {
      const spoof = r.spoofing ?? r.spoofed;
      const lvl: ConfidenceLevel = spoof === true ? "High" : spoof === false ? "Low" : "Unknown";
      return { headline: `${spoof === true ? "Spoofing indicators" : spoof === false ? "No spoofing indicators" : "Traced"} · origin ${r.originIp || r.origin || "Unknown"}`, level: lvl };
    }
    // post
    const v = r.verdict || r.rating || r.status;
    const lvl: ConfidenceLevel = /false|misleading|fake|unsupported/i.test(String(v)) ? "High"
      : /true|accurate|supported/i.test(String(v)) ? "Low" : "Unknown";
    return { headline: v ? `Verdict: ${v}` : "Checked", level: lvl };
  } catch {
    return { headline: "Checked", level: "Unknown" };
  }
}

function CheckInner() {
  const params = useSearchParams();
  const [input, setInput] = useState("");
  const [override, setOverride] = useState<CheckType | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<CheckRecord | null>(null);
  const [connections, setConnections] = useState<ClueConnection[]>([]);

  const detection = detectCheckType(input);
  const type: CheckType = override || detection.type;

  // Reopen a saved check from history, or prefill from ?input=.
  useEffect(() => {
    const id = params.get("reopen");
    if (id) {
      const r = getLocal(id);
      if (r) {
        setInput(r.input); setOverride(r.type); setRecord(r);
        setConnections(connectionsFor(r.id, extractEntities(r.type, r.input, r.result)));
        return;
      }
    }
    const pre = params.get("input");
    if (pre) setInput(pre);
    const t = params.get("type") as CheckType | null;
    if (t && CHECK_TYPES.some((x) => x.type === t)) setOverride(t);
  }, [params]);

  const run = useCallback(async () => {
    const value = input.trim();
    if (!value) return;
    setRunning(true); setError(null); setRecord(null); setConnections([]);
    try {
      const res = type === "narrative"
        ? await fetch(`/api/brandwatch?entity=${encodeURIComponent(value)}&deep=1`, { cache: "no-store" })
        : await fetch(ENDPOINT[type], {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyFor(type, value)),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Check failed");
      const { headline, level } = summarize(type, data);
      const rec: CheckRecord = { id: genId(), type, input: value, headline, level, result: data, createdAt: new Date().toISOString() };
      setRecord(rec);
      saveLocal(rec);
      syncShared(rec);
      // Clue layer: link repeated entities to earlier checks, then record this one.
      setConnections(linkAndRecord(rec.id, extractEntities(type, value, data)));
    } catch (e: any) {
      setError(e?.message || "Check failed");
    } finally {
      setRunning(false);
    }
  }, [input, type]);

  const evidence: any[] = Array.isArray(record?.result?.evidence) ? record!.result.evidence
    : Array.isArray(record?.result?.signals) ? record!.result.signals : [];

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Check</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-gray-400">
          Paste a URL, a post link, a claim, email headers, or a log. We detect the type and run the
          right check. Indicators with evidence — not a verdict.
        </p>
      </div>

      <div className="card">
        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setOverride(null); }}
          placeholder="Paste a URL, a claim/post, email headers, or log lines…"
          rows={input.includes("\n") ? 6 : 2}
          className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:border-brand"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Type:</span>
          {CHECK_TYPES.map((t) => (
            <button key={t.type} onClick={() => setOverride(t.type)}
              className={`rounded-lg px-2.5 py-1 text-xs transition ${type === t.type ? "bg-white/[0.08] text-white ring-hairline" : "text-gray-400 hover:bg-white/[0.04]"}`}>
              {t.label}
            </button>
          ))}
          <button onClick={run} disabled={running || input.trim().length < 2}
            className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02] disabled:opacity-50">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Run check
          </button>
        </div>
        {input.trim() && (
          <p className="mt-2 text-xs text-gray-500">
            Detected: <span className="text-gray-300">{detection.label}</span> ({detection.confidence.toLowerCase()} confidence) — {detection.reason} You can override above.
          </p>
        )}
      </div>

      {error && <div className="card border-risk-high/40 bg-risk-high/[0.06] text-sm text-risk-high">{error}</div>}

      {record && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ConfidenceBadge level={record.level as ConfidenceLevel} />
              <span className="font-semibold text-white">{record.headline}</span>
            </div>
            <div className="flex items-center gap-3">
              {record.type === "narrative" && (
                <a href={`/api/brandwatch/report?entity=${encodeURIComponent(record.input)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-brand-soft hover:underline">
                  Export report (PDF) <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Link href={`${TOOL_ROUTE[record.type]}${record.type === "site" ? `?url=${encodeURIComponent(record.input)}` : ""}`}
                className="flex items-center gap-1 text-xs text-brand-soft hover:underline">
                Open full {CHECK_TYPES.find((t) => t.type === record.type)?.label} <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          {connections.length > 0 && (
            <div className="rounded-lg border border-brand/30 bg-brand/[0.06] p-3">
              <div className="text-xs font-semibold text-brand-soft">Connections to your earlier checks</div>
              <ul className="mt-1.5 space-y-1">
                {connections.map((c, i) => (
                  <li key={i} className="text-sm text-gray-300">
                    This <span className="font-medium">{c.label}</span> also appeared in {c.checks.length} earlier check{c.checks.length > 1 ? "s" : ""}:{" "}
                    {c.checks.slice(0, 4).map((ch, j) => (
                      <span key={ch.id}>
                        {j > 0 && ", "}
                        <Link href={`/check?reopen=${encodeURIComponent(ch.id)}`} className="text-brand-soft hover:underline">{ch.headline.slice(0, 40)}</Link>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-gray-500">Observed overlap in collected data — a lead, not proof of a shared operator.</p>
            </div>
          )}
          {record.type === "narrative" && (
            <div className="space-y-3 border-t border-white/[0.06] pt-3">
              {/* Indicators — each with level + signals + alternative */}
              {Array.isArray(record.result.indicators) && record.result.indicators.map((ind: any) => (
                <div key={ind.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-200">{ind.label}</span>
                    <ConfidenceBadge level={ind.level} label={ind.level !== "Unknown" ? String(ind.score) : undefined} />
                  </div>
                  {ind.signals?.length > 0 && <ul className="mt-1">{ind.signals.map((s: string, i: number) => <li key={i} className="text-xs text-gray-400">• {s}</li>)}</ul>}
                  <p className="mt-0.5 text-xs text-gray-500"><span className="text-gray-600">Could also be:</span> {ind.alternative}</p>
                </div>
              ))}
              {/* Earliest observable node */}
              {record.result.earliest && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <div className="text-xs font-semibold text-gray-400">Earliest observed in collected data <span className="font-normal">— not the true origin</span></div>
                  <p className="mt-1 text-gray-300">{record.result.earliest.text}</p>
                  <div className="mt-1 text-xs text-gray-500">
                    {record.result.earliest.source}{record.result.earliest.account ? ` · ${record.result.earliest.account}` : ""}{record.result.earliest.timestamp ? ` · ${record.result.earliest.timestamp}` : ""}
                    {record.result.earliest.url && <> · <a href={record.result.earliest.url} target="_blank" rel="noopener noreferrer" className="text-brand-soft hover:underline">source</a></>}
                  </div>
                </div>
              )}
              {/* Narrative clusters (AI) */}
              {record.result.narratives?.available && record.result.narratives.clusters?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400">Narrative clusters</div>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {record.result.narratives.clusters.map((c: any, i: number) => (
                      <div key={i} className="rounded-lg border border-white/[0.06] p-2 text-xs">
                        <div className="font-medium text-gray-200">{c.label} <span className="text-gray-500">· {c.hostility}</span></div>
                        <div className="text-gray-400">{c.summary}</div>
                        <div className="mt-0.5 text-gray-600">Could also be: {c.alternative}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Source appendix */}
              {Array.isArray(record.result.sources) && (
                <div className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-400">Sources:</span>{" "}
                  {record.result.sources.map((s: any, i: number) => (
                    <span key={i}>{i > 0 && " · "}{s.source} {s.connected ? `(${s.count})` : "(not connected)"}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {record.type !== "narrative" && evidence.length > 0 && (
            <ul className="space-y-1 border-t border-white/[0.06] pt-3">
              {evidence.slice(0, 8).map((e, i) => (
                <li key={i} className="text-sm text-gray-400">• {typeof e === "string" ? e : (e.label || e.text || e.signal || JSON.stringify(e).slice(0, 160))}</li>
              ))}
            </ul>
          )}
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">Raw result</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed">{JSON.stringify(record.result, null, 2)}</pre>
          </details>
          <p className="text-xs text-gray-600">Saved to <Link href="/history" className="text-brand-soft hover:underline">History</Link> automatically. Indicators, not a verdict.</p>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}

export default function CheckPage() {
  return <Suspense fallback={<div className="py-16 text-center text-gray-500">Loading…</div>}><CheckInner /></Suspense>;
}
