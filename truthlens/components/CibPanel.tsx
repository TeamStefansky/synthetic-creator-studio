"use client";

// Coordinated Inauthentic Behavior (CIB) panel for the Site Report. On-demand:
// collects public mentions of the site and grades a Coordination Likelihood with
// raw evidence. NEVER attributes to a state/actor - the ceiling is
// "Strong - actor UNDETERMINED", and the Attribution & Limitations box is always shown.

import { useState } from "react";
import { Loader2, Radar, ShieldAlert } from "lucide-react";
import ConfidenceBadge, { ConfidenceLevel } from "@/components/ConfidenceBadge";
import AuthenticityPanel from "@/components/AuthenticityPanel";

const TIER: Record<string, { tone: string; ring: string }> = {
  Strong: { tone: "text-risk-high", ring: "border-risk-high/40" },
  Moderate: { tone: "text-risk-unknown", ring: "border-risk-unknown/40" },
  Weak: { tone: "text-risk-legit", ring: "border-risk-legit/40" },
  None: { tone: "text-ink-secondary", ring: "border-white/10" },
};

const CONF: Record<string, ConfidenceLevel> = { High: "High", Medium: "Medium", Low: "Low", "Not collected": "Unknown" };

export default function CibPanel({ domain }: { domain: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<any>(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/cib?entity=${encodeURIComponent(domain)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "CIB analysis failed");
      setR(data);
    } catch (e: any) { setError(e?.message || "CIB analysis failed"); }
    finally { setLoading(false); }
  };

  const tier = r ? (TIER[r.likelihood] || TIER.None) : null;

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Radar className="h-5 w-5 text-brand-soft" /> Coordinated Inauthentic Behavior
        </h2>
        {!r && (
          <button onClick={run} disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Run CIB analysis
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-secondary">
        Scans public mentions of this site (news, Bluesky, Hacker News, Reddit) for coordination signals. Indicators - not a verdict.
      </p>

      {error && <div className="mt-3 rounded-lg border border-risk-high/40 bg-risk-high/[0.06] p-2 text-sm text-risk-high">{error}</div>}

      {r && tier && (
        <div className="mt-4 space-y-4">
          <div className={`rounded-xl border ${tier.ring} bg-white/[0.02] p-3`}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-ink-secondary">Coordination Likelihood</span>
              <span className={`text-lg font-bold ${tier.tone}`}>{r.likelihood}</span>
              <span className="text-sm text-ink-secondary">· actor <strong className="text-ink">UNDETERMINED</strong></span>
            </div>
            <div className="mt-0.5 text-xs text-ink-secondary">{r.totalItems} public mentions · {r.accounts} accounts</div>
          </div>

          {/* Signals */}
          <div className="space-y-3">
            {r.signals.map((s: any, i: number) => (
              <div key={i}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-ink">{s.name}</span>
                  <ConfidenceBadge level={CONF[s.confidence] || "Unknown"} label={s.confidence === "Not collected" ? "not collected" : undefined} />
                </div>
                <ul className="mt-1">{s.evidence.map((e: string, j: number) => <li key={j} className="text-xs text-ink-secondary">• {e}</li>)}</ul>
                {s.alternative && s.alternative !== "n/a" && !s.alternative.startsWith("n/a") && (
                  <p className="mt-0.5 text-xs text-ink-secondary"><span className="text-ink-muted">Could also be:</span> {s.alternative}</p>
                )}
              </div>
            ))}
          </div>

          {/* Copypasta clusters */}
          {r.clusters?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-ink-secondary">Near-identical content clusters</div>
              <div className="mt-1 space-y-1">
                {r.clusters.slice(0, 5).map((c: any, i: number) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs">
                    <span className="text-ink">{c.size} posts · {c.accounts} accounts · {c.sources.join(", ")}</span>
                    <div className="text-ink-secondary">“{c.text}”</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attribution & Limitations - mandatory, verbatim */}
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-200/90">
            <div className="font-semibold">Attribution &amp; Limitations</div>
            <p className="mt-1">{r.attribution}</p>
            {r.collectionGaps?.length > 0 && (
              <p className="mt-1 text-xs text-yellow-100/70">Collection gaps: {r.collectionGaps.join(" ")}</p>
            )}
            <div className="mt-2 text-xs">
              <div className="font-semibold">What a human should verify next:</div>
              <ul className="mt-0.5 list-disc pl-4">{r.nextSteps.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
            </div>
          </div>

          {Array.isArray(r.authenticity) && r.authenticity.length > 0 && (
            <AuthenticityPanel entity={domain} accounts={r.authenticity} />
          )}

          {Array.isArray(r.archives) && r.archives.length > 0 && (
            <div className="text-xs text-ink-secondary">
              <div className="font-semibold text-ink-secondary">Preserved evidence ({r.archives.length}):</div>
              <ul className="mt-0.5 space-y-0.5">
                {r.archives.map((a: any, i: number) => (
                  <li key={i} className="truncate">
                    <a href={a.archiveUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" title={a.status === "archived" ? "Preserved snapshot (Wayback Machine)" : "Save requested - snapshot may still be processing"}>
                      {a.status === "archived" ? "archived ↗" : "archive requested ↗"}
                    </a>{" "}<span className="text-ink-muted">{a.url}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(r.sources) && (
            <p className="text-xs text-ink-secondary">
              Sources: {r.sources.map((s: any, i: number) => <span key={i}>{i > 0 && " · "}{s.source} {s.connected ? `(${s.count})` : "(not connected)"}</span>)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
