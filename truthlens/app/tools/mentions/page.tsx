"use client";

import { useState, useEffect } from "react";
import { Globe, ArrowRight, ExternalLink, MapPin } from "lucide-react";
import type { MentionsAggregate } from "@/lib/mentions-map";
import type { Mention } from "@/lib/narrative/types";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";
import MentionsMap from "@/components/MentionsMap";

interface Result extends MentionsAggregate { entity: string; generatedAt: string }

function fmt(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function BrandMentionsPage() {
  const [entity, setEntity] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Prefill + auto-run from ?entity= (used by the Monitor "open full" link).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("entity");
    if (q && q.trim().length >= 2) { setEntity(q); scan(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scan = async (value?: string) => {
    const e = value ?? entity;
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch(`/api/mentions?entity=${encodeURIComponent(e)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Scan failed");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const maxCountry = result?.byCountry[0]?.count || 1;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Globe className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Brand <span className="gradient-text">Mentions</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          See exactly where a brand or term appears across public sources - news (GDELT, Guardian,
          NYT), Bluesky, Reddit, Hacker News, RSS (and X if a key is set). Grouped by source and by
          country, with a direct link to every appearance.
        </p>
      </div>

      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); if (entity.trim().length >= 2) scan(); }} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            placeholder="Brand or term, e.g. Acme Corp"
            className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-3 text-base outline-none transition focus:border-brand"
          />
          <button type="submit" className="btn shrink-0" disabled={loading || entity.trim().length < 2}>
            {loading ? "Scanning…" : <>Find mentions <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
        <p className="mt-2 text-xs text-ink-secondary">Public sources only. Results are cached briefly for reproducibility.</p>
      </div>

      {!result && !loading && (
        <ToolIntro
          heading="Where does my brand appear?"
          what={<>Type a brand or term and TruthLens pulls every public mention it can find across news and social sources, de-duplicates them, and shows <span className="text-ink">where</span> they came from - by source and by country - with a link to each one. Add it to your <span className="text-ink">Monitor</span> watchlist to track it over time.</>}
          examplesLabel="Try it"
          examples={[{ label: "Find mentions of \"OpenAI\"", onClick: () => { setEntity("OpenAI"); scan("OpenAI"); } }]}
          legend={[
            { label: "By source", tone: "neutral", text: "which platforms/outlets carry the mention." },
            { label: "By country", tone: "neutral", text: "where the source is based (when reported, e.g. GDELT)." },
            { label: "Not connected", tone: "unknown", text: "a source without a key shows honestly, never faked." },
          ]}
          note="Mentions are public posts/articles by accounts and outlets - never claims about private individuals. Country reflects the source outlet, not any person's location."
        />
      )}

      {result && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-lg font-bold">{result.total} mention{result.total === 1 ? "" : "s"} of &ldquo;{result.entity}&rdquo;</div>
              <div className="text-xs text-ink-secondary">scanned {fmt(result.generatedAt)}</div>
            </div>
            {/* Source status chips - connected + count, or an honest "not connected". */}
            <div className="mt-3 flex flex-wrap gap-2">
              {result.sources.map((s) => (
                <span
                  key={s.source}
                  title={s.connected ? (s.error || "") : (s.reason || "not connected")}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${s.connected ? "border-white/15 text-ink-secondary" : "border-yellow-500/30 bg-yellow-500/5 text-yellow-200/80"}`}
                >
                  {s.source}{s.connected ? ` · ${s.count}` : " · not connected"}
                </span>
              ))}
            </div>
          </div>

          {/* World map (dependency-free SVG) - bubbles per source country. */}
          <div className="card">
            <div className="label-muted mb-2 flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> World map (drag to pan, scroll to zoom, hover a bubble)</div>
            <MentionsMap data={result.byCountry} />
          </div>

          {/* Geographic breakdown - the "where in the world" view. */}
          <div className="card">
            <div className="label-muted mb-2 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Where it appears (by country)</div>
            {result.byCountry.length === 0 ? (
              <p className="text-sm text-ink-secondary">No source reported a country for these mentions.</p>
            ) : (
              <div className="space-y-1.5">
                {result.byCountry.slice(0, 20).map((c) => (
                  <div key={c.key} className="flex items-center gap-2 text-sm">
                    <div className="w-40 shrink-0 truncate text-ink-secondary">{c.flag ? `${c.flag} ` : ""}{c.label}</div>
                    <div className="h-3 flex-1 rounded-full bg-white/5">
                      <div className="h-3 rounded-full bg-gradient-brand" style={{ width: `${Math.max(4, (c.count / maxCountry) * 100)}%` }} />
                    </div>
                    <div className="w-8 shrink-0 text-right font-mono text-xs text-ink">{c.count}</div>
                  </div>
                ))}
                {result.countryUnknown > 0 && (
                  <div className="pt-1 text-xs text-ink-secondary">{result.countryUnknown} mention(s) with no reported country.</div>
                )}
              </div>
            )}
          </div>

          {/* Every appearance, most recent first. */}
          <div className="card">
            <div className="label-muted mb-2">Every appearance</div>
            <ul className="divide-y divide-white/5">
              {result.mentions.map((m: Mention, i) => (
                <li key={i} className="py-2">
                  <div className="flex items-center gap-2 text-xs text-ink-secondary">
                    <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase tracking-wide">{m.source}</span>
                    {m.account && <span className="truncate">{m.account}</span>}
                    {m.country && <span>· {m.country}</span>}
                    {m.timestamp && <span>· {fmt(m.timestamp)}</span>}
                  </div>
                  <div className="mt-1 text-sm text-ink">{m.text?.slice(0, 240) || "(no text)"}</div>
                  {m.url && (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                      Open source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
