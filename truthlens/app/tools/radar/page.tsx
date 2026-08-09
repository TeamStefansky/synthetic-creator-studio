"use client";

// Early-Warning Radar — enter a watch term and get a forward-looking forecast of
// narrative-escalation risk within a horizon, from its public attention + tone
// history. A forecast, not a verdict: band + probability + confidence + evidence
// + an explicit alternative; Unknown when the history is too thin. The value
// holds in quiet periods too — a logged Calm baseline is what the next spike is
// measured against.

import { useState } from "react";
import { RadarIcon, Loader2, TrendingUp, RotateCcw } from "lucide-react";
import ToolIntro from "@/components/ToolIntro";
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/ConfidenceBadge";
import Disclaimer from "@/components/Disclaimer";

type Indicator = { key: string; label: string; contribution: number; detail: string };
type Forecast = {
  available: boolean; reason?: string;
  band: "Calm" | "Watch" | "Elevated" | "Warning" | "Unknown";
  hazard: number; horizonDays: number;
  confidence: ConfidenceLevel; indicators: Indicator[];
  evidence: string[]; alternative: string; estimative?: string;
};

const BAND_UI: Record<string, { cls: string; ring: string; label: string }> = {
  Calm: { cls: "text-risk-legit", ring: "border-risk-legit/40", label: "Calm" },
  Watch: { cls: "text-risk-unknown", ring: "border-risk-unknown/40", label: "Watch" },
  Elevated: { cls: "text-risk-high/80", ring: "border-risk-high/30", label: "Elevated" },
  Warning: { cls: "text-risk-high", ring: "border-risk-high/50", label: "Warning" },
  Unknown: { cls: "text-ink-secondary", ring: "border-line", label: "Unknown" },
};

export default function RadarPage() {
  const [entity, setEntity] = useState("");
  const [data, setData] = useState<{ forecast: Forecast; sources: any; entity: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (entity.trim().length < 2) { setError("Enter a term (≥ 2 characters)."); return; }
    setLoading(true); setError(""); setData(null);
    try {
      const r = await fetch(`/api/radar?entity=${encodeURIComponent(entity.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Forecast failed");
      setData(j);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const f = data?.forecast;
  const band = f ? BAND_UI[f.band] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <RadarIcon className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Early-Warning <span className="gradient-text">Radar</span></h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
          An actuarial forecast of a developing narrative risk — while it is still far off. It reads the term’s public
          attention and tone history, projects the risk of escalation within a horizon, and can re-score the risk so the
          monitoring loop stays a step ahead of the next wave. A forecast, never a verdict.
        </p>
      </div>

      <div className="card flex flex-col gap-2 sm:flex-row">
        <input
          value={entity} onChange={(e) => setEntity(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="Watch term or brand (e.g. a campaign, an org, a claim)"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none focus:border-brand-soft"
        />
        <button onClick={run} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadarIcon className="h-4 w-4" />}
          {loading ? "Forecasting…" : "Forecast"}
        </button>
      </div>

      {error && <div className="card border-risk-high/30 text-sm text-risk-high">{error}</div>}

      {f && !f.available && (
        <div className="card text-sm text-ink-secondary">{f.reason || "No forecast available."}</div>
      )}

      {f && f.available && band && (
        <div className="space-y-4">
          <div className={`card ${band.ring}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold ${band.cls}`}>{band.label}</div>
                <ConfidenceBadge level={f.confidence} />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-ink">{Math.round(f.hazard * 100)}%</div>
                <div className="text-[11px] text-ink-muted">escalation risk · {f.horizonDays}-day horizon</div>
              </div>
            </div>
            {f.estimative && <div className="mt-2 text-sm text-ink-secondary"><span className="text-ink">{f.estimative}</span> to escalate within the horizon.</div>}
          </div>

          {f.indicators.length > 0 && (
            <div className="card">
              <div className="label-muted mb-2 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Leading indicators</div>
              <ul className="space-y-2">
                {f.indicators.map((ind) => (
                  <li key={ind.key} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-bg-elev p-3">
                    <div>
                      <div className="text-sm text-ink">{ind.label}</div>
                      <div className="text-[12px] text-ink-secondary">{ind.detail}</div>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-mono ${ind.contribution >= 0 ? "bg-risk-high/15 text-risk-high" : "bg-risk-legit/15 text-risk-legit"}`}>
                      {ind.contribution >= 0 ? "+" : ""}{ind.contribution.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="label-muted mb-1">Evidence</div>
            <p className="text-sm text-ink-soft">{f.evidence.join(" ")}</p>
            <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-secondary"><span className="font-medium text-ink">Could also be explained by: </span>{f.alternative}</p>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
              <RotateCcw className="h-3 w-3" /> Report &amp; renewal: this forecast is recomputed each cycle, and the loop tightens as the baseline adapts — a logged Calm is what the next spike is measured against.
            </div>
            <div className="mt-1 text-[11px] text-ink-muted">
              Sources: attention {data?.sources?.wikipedia ? "connected" : "not connected"} · tone {data?.sources?.tone ? "connected" : "not connected"}.
            </div>
          </div>
        </div>
      )}

      <div className="mt-4">
        <ToolIntro
          what={<>The radar fits a transparent hazard model over the term’s recent <span className="text-ink">attention</span> and <span className="text-ink">tone</span> history — level anomaly, growth/diffusion, a recent regime shift, a count spike, and a tone turn — and returns the probability of <span className="text-ink">escalation within a horizon</span>, with every indicator’s contribution shown.</>}
          steps={[
            <>Enter a watch term and press <span className="text-ink">Forecast</span>.</>,
            <>Read the band + probability with its confidence — and always its alternative.</>,
            <>Feed it into monitoring so the loop pre-empts, not just reacts.</>,
          ]}
          note="Keyless: uses public Wikipedia attention + GDELT tone series. Too little history → Unknown, never a guessed forecast. Deterministic and reproducible."
        />
      </div>

      <Disclaimer />
    </div>
  );
}
