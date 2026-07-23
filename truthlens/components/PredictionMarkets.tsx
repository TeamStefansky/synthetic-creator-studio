"use client";

// Reusable prediction-markets card (Polymarket). Drop into any tool that has an
// entity/query: <PredictionMarkets query="Nike" />. Shows matching market
// questions with the current real-money probability + a link to the source
// market. Renders nothing if there are no matching markets (most brands have
// none) so it never clutters. Forward-looking signal, never a verdict.

import { useEffect, useState } from "react";
import { TrendingUp, ExternalLink } from "lucide-react";
import type { PredictionMarket } from "@/lib/polymarket";

export default function PredictionMarkets({ query, className = "" }: { query: string; className?: string }) {
  const [markets, setMarkets] = useState<PredictionMarket[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 2) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/predictions?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMarkets(Array.isArray(d.markets) ? d.markets : []); })
      .catch(() => { if (!cancelled) setMarkets([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  // Only render the card when there is something to show (or while loading).
  if (!loading && (!markets || markets.length === 0)) return null;

  return (
    <div className={`card ${className}`}>
      <div className="label-muted mb-2 flex items-center gap-1">
        <TrendingUp className="h-3.5 w-3.5" /> Prediction markets
        <span className="ml-1 normal-case tracking-normal text-ink-muted">· Polymarket (real-money odds)</span>
      </div>
      {loading && !markets ? (
        <p className="text-sm text-ink-secondary">Checking markets…</p>
      ) : (
        <ul className="space-y-2">
          {markets!.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              {typeof m.probability === "number" && (
                <span className="w-12 shrink-0 text-right font-mono text-sm font-bold text-brand-soft">
                  {Math.round(m.probability * 100)}%
                </span>
              )}
              <div className="min-w-0 flex-1">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-ink hover:underline">
                  <span className="truncate">{m.question}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-ink-muted" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-ink-secondary">Market-implied probabilities - a forward-looking signal, not a verdict.</p>
    </div>
  );
}
