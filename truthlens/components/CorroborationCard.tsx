"use client";

// Evidence corroboration overlay for the Link Board — makes a shared-artifact
// "link" defensible: measured worldwide prevalence (reverse-lookup), id recency
// (deprecated UA-), an analytic null baseline, and an honest list of what was NOT
// scanned (where the strongest link evidence usually lives). Additive and
// down-only — it never raises a calibrated tier.

import type { Corroboration } from "@/lib/board/types";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { ShieldQuestion, Search, AlertTriangle, FlaskConical, EyeOff } from "lucide-react";

const BAND_LABEL: Record<string, string> = {
  "unique-pair": "only the compared sites",
  few: "a handful of sites",
  many: "dozens of sites",
  ubiquitous: "hundreds+ of sites",
  unknown: "not measured",
};

export default function CorroborationCard({ c }: { c: Corroboration }) {
  return (
    <div className="card">
      <div className="label-muted mb-2 flex items-center gap-1">
        <ShieldQuestion className="h-3.5 w-3.5" /> Evidence strength &amp; calibration
      </div>
      <p className="mb-3 text-sm text-ink-secondary">{c.summary}</p>

      {/* Reverse-lookup prevalence per distinctive shared id */}
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink">
          <Search className="h-3.5 w-3.5" /> Worldwide prevalence (reverse-lookup)
        </div>
        {!c.prevalenceConnected && (
          <div className="mb-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-2.5 py-1.5 text-[12px] text-yellow-200/80">
            Reverse-lookup not connected — the worldwide prevalence of a shared id is unmeasured, so no
            shared id can be called a High-confidence link yet. Connect BuiltWith / DNSlytics / PublicWWW /
            SpyOnWeb to corroborate. A shared id is treated as uncorroborated, never assumed unique.
          </div>
        )}
        {c.artifacts.length === 0 ? (
          <p className="text-[12px] text-ink-secondary">No account-scoped shared ids (GA4/GTM/Pixel/AdSense) among the compared sites.</p>
        ) : (
          <ul className="space-y-2">
            {c.artifacts.map((a, i) => (
              <li key={i} className="rounded-lg border border-line bg-bg-elev px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-[12px] text-ink">{a.display}</code>
                  {a.deprecated && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/5 px-2 py-0.5 text-[10px] text-yellow-200/80">
                      <AlertTriangle className="h-3 w-3" /> deprecated UA-
                    </span>
                  )}
                  <span className="text-[11px] text-ink-secondary">
                    carried by {BAND_LABEL[a.prevalence.band] ?? a.prevalence.band}
                    {a.prevalence.count != null ? ` (${a.prevalence.count})` : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px]">
                    <span className="text-ink-secondary line-through decoration-ink-secondary/50">{a.baseStrength}</span>
                    →
                    <ConfidenceBadge level={a.effectiveStrength} />
                  </span>
                </div>
                {a.prevalence.url && (
                  <a href={a.prevalence.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-brand-soft underline">
                    {a.prevalence.provider} reverse-lookup ↗
                  </a>
                )}
                {a.notes.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[11px] text-ink-secondary">
                    {a.notes.map((n, j) => <li key={j}>{n}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Analytic null baseline / significance */}
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink">
          <FlaskConical className="h-3.5 w-3.5" /> Null model &amp; significance
        </div>
        <p className="text-[12px] text-ink-secondary">
          <span className="text-ink">{c.control.distinctiveOverlapCount}</span> distinctive shared artifact(s).{" "}
          {c.control.significance}
        </p>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-[11px]">
            <div className="mb-0.5 font-semibold text-ink">If genuinely linked</div>
            <div className="text-ink-secondary">{c.nullHypothesis.ifLinked}</div>
          </div>
          <div className="rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-[11px]">
            <div className="mb-0.5 font-semibold text-ink">If unrelated</div>
            <div className="text-ink-secondary">{c.nullHypothesis.ifUnrelated}</div>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-ink-secondary">{c.control.note}</p>
      </div>

      {/* What was not scanned — where the strongest link evidence lives */}
      <div>
        <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink">
          <EyeOff className="h-3.5 w-3.5" /> Not scanned — the strongest link evidence usually lives here
        </div>
        <ul className="space-y-1.5">
          {c.notScanned.map((n, i) => (
            <li key={i} className="rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-[11px]">
              <div className="font-semibold text-ink">{n.area}</div>
              <div className="text-ink-secondary">{n.why}</div>
              <div className="mt-0.5 text-ink-secondary">→ {n.where}</div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-ink-secondary">
          Overlay {c.version} · additive &amp; down-only — infrastructure overlap alone proves shared technical
          setup, not cooperation, ownership, or shared aims.
        </p>
      </div>
    </div>
  );
}
