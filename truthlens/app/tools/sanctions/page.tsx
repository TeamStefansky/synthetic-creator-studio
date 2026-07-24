"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, ArrowRight, ExternalLink, PlugZap } from "lucide-react";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";
import type { SanctionScreen } from "@/lib/opensanctions";
import { recordSearch } from "@/lib/clues/record";

// Sanctions screening - checks a name/organization against consolidated PUBLIC
// sanctions & watchlists (OFAC/EU/UN/UK...) via OpenSanctions. Lawful disclosure
// of public government designations, cited to source - not a verdict, not a
// dossier. "No hit" is a valid, common, and reassuring result.

const SCHEMA_TONE: Record<string, string> = {
  Person: "border-yellow-500/30 bg-yellow-500/5 text-yellow-200/90",
  Organization: "border-brand/30 bg-brand/5 text-brand-soft",
  Company: "border-brand/30 bg-brand/5 text-brand-soft",
};

export default function SanctionsPage() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SanctionScreen | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const screen = async (value?: string) => {
    const query = (value ?? q).trim();
    if (query.length < 2) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch(`/api/sanctions?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const txt = await r.text();
      let data: any; try { data = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || "unreadable response"); }
      setResult(data);
      recordSearch("sanctions", query, `sanctions: ${query}`, data);
    } catch (e: any) { setError(e?.message || "screening failed"); }
    finally { setLoading(false); }
  };

  // Prefill + auto-run from ?q= (used by Case Board "Next: Screen operator").
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v && v.trim().length >= 2) { setQ(v.trim()); screen(v.trim()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Sanctions <span className="gradient-text">Screening</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Check a name or organization against consolidated public sanctions and watchlists
          (OFAC SDN, EU, UN, UK HMT and more) via OpenSanctions. Results are public government
          designations, cited to their source - decision-support, not a verdict.
        </p>
      </div>

      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); screen(); }} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or organization to screen - e.g. Acme Trading LLC"
            className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-3 text-base outline-none transition focus:border-brand"
          />
          <button type="submit" className="btn shrink-0" disabled={loading || q.trim().length < 2}>
            {loading ? "Screening…" : <>Screen <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
        <p className="mt-2 text-xs text-ink-secondary">Public watchlist data only. Cached briefly for reproducibility.</p>
      </div>

      {!result && !loading && (
        <ToolIntro
          heading="Is this entity on a sanctions list?"
          what={<>Type a person or organization and TruthLens checks it against consolidated public sanctions & watchlists via <span className="text-ink">OpenSanctions</span>. Each hit shows the exact list(s) it appears on, with a link to the public record. A <span className="text-ink">clean result is common and reassuring</span> - it is not proof of anything, just that no public designation matched.</>}
          legend={[
            { label: "Hit", tone: "high", text: "the name matches a public sanctions/watchlist entry - verify it's the same entity." },
            { label: "No hit", tone: "legit", text: "no public designation matched this query." },
            { label: "Not connected", tone: "unknown", text: "needs a free OpenSanctions API key; shown honestly, never faked." },
          ]}
          note="Public government designations only, cited to source. Screening is not a verdict - name matches can be false positives; confirm identity before acting."
        />
      )}

      {result && !result.connected && (
        <div className="card border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-2 text-sm">
            <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" />
            <div>
              <div className="font-semibold text-yellow-100">Sanctions screening is not connected.</div>
              <p className="mt-1 text-ink-secondary">{result.reason}</p>
            </div>
          </div>
        </div>
      )}

      {result && result.connected && (
        <div className="card">
          <div className="mb-3 text-sm">
            {result.hits.length === 0 ? (
              <span className="text-risk-legit">No public sanctions/watchlist entry matched &ldquo;{result.query}&rdquo;. That is a valid, common result.</span>
            ) : (
              <span className="font-semibold">{result.hits.length} possible match{result.hits.length === 1 ? "" : "es"} for &ldquo;{result.query}&rdquo; - verify identity before acting.</span>
            )}
          </div>
          {result.hits.length > 0 && (
            <ul className="divide-y divide-white/5">
              {result.hits.map((h) => (
                <li key={h.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${SCHEMA_TONE[h.schema] || "border-white/15 text-ink-secondary"}`}>{h.schema}</span>
                    <span className="font-medium text-ink">{h.caption}</span>
                    {typeof h.score === "number" && <span className="text-xs text-ink-secondary">· match {Math.round(h.score * 100)}%</span>}
                    <a href={h.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                      record <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-secondary">
                    {h.datasets.length > 0 && <span>lists: {h.datasets.slice(0, 6).join(", ")}</span>}
                    {h.countries.length > 0 && <span>· countries: {h.countries.slice(0, 6).join(", ").toUpperCase()}</span>}
                    {h.topics.length > 0 && <span>· {h.topics.slice(0, 4).join(", ")}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-ink-secondary">Source: OpenSanctions (consolidated public sanctions, PEP &amp; watchlist data). A name match is not proof of identity - confirm before acting.</p>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
