"use client";

// Case summary report - renders the assembled report (lib/casebook/dossier) in
// the TruthLens report style: BLUF, subject profiles, the cross-search evidence
// chain (confidence + alternative on every row), infrastructure, gaps, and the
// standing disclaimer. Print-to-PDF uses the app's existing print CSS.

import ConfidenceBadge, { type ConfidenceLevel } from "@/components/ConfidenceBadge";
import type { CaseDossier, Band } from "@/lib/casebook/dossier";
import { fmtDate } from "@/lib/ui";

const BAND_TO_LEVEL: Record<Band, ConfidenceLevel> = {
  High: "High", Medium: "Medium", Low: "Low", Background: "Unknown",
};

const CONCLUSION_TONE: Record<string, string> = {
  Association: "text-risk-unknown",
  "Weak association": "text-ink-secondary",
  "No link established": "text-risk-legit",
  "Insufficient data": "text-ink-secondary",
};

export default function CaseReport({ report }: { report: CaseDossier }) {
  return (
    <div className="space-y-6 rounded-2xl bg-bg-base p-1">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-xl font-bold tracking-tight">TRUTH<span className="gradient-text">LENS</span></span>
          <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">Defensive OSINT · Decision-support</span>
        </div>
        <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Case Summary Report</div>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink">{report.title}</h1>
        {report.subject && <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{report.subject}</p>}
        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Generated: {fmtDate(report.generatedAt)}</span>
          {report.toolsUsed.length > 0 && <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Modules: {report.toolsUsed.join(" · ")}</span>}
          <span className={`rounded-full border border-line px-2.5 py-1 font-semibold ${CONCLUSION_TONE[report.conclusionLevel] || "text-ink"}`}>
            Conclusion: {report.conclusionLevel}
          </span>
        </div>
      </div>

      {/* BLUF - amber-accented callout */}
      <div className="rounded-2xl border border-risk-unknown/30 bg-bg-card p-6" style={{ borderLeftWidth: 3 }}>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-risk-unknown">◆ Bottom line up front</div>
        <p className="text-sm leading-relaxed text-ink-soft">{report.bluf}</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { n: String(report.searchCount), label: "Searches" },
          { n: String(report.subjects.length), label: "Assets" },
          { n: String(report.evidence.length), label: "Links found" },
          { n: String(report.hostConduct.length), label: "Documented hosts" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-bg-card px-5 py-4">
            <div className="font-display text-3xl font-bold gradient-text">{s.n}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Subjects */}
      {report.subjects.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-ink">The assets in this case</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.subjects.map((s) => (
              <div key={s.checkId} className="rounded-xl border border-line bg-bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-ink">{s.domain}</span>
                  {s.risk != null && (
                    <span className="shrink-0 text-lg font-bold text-ink">{s.risk}<span className="text-xs text-ink-muted">/100</span></span>
                  )}
                </div>
                <div className="mt-1 truncate text-[12px] text-ink-muted">{s.headline}</div>
                {(s.confidence || s.facts.length > 0) && (
                  <ul className="mt-2 space-y-1 text-[12px] text-ink-secondary">
                    {s.confidence && <li>Confidence: {s.confidence}</li>}
                    {s.facts.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Evidence chain */}
      <section>
        <h2 className="mb-1 font-display text-lg font-bold text-ink">The links the system found</h2>
        <p className="mb-3 text-[12px] text-ink-muted">Entities shared across two or more searches in this case. Strongest first. Every link carries its alternative explanation - association is not shared ownership.</p>
        {report.evidence.length === 0 ? (
          <div className="rounded-xl border border-line bg-bg-card p-4 text-sm text-ink-secondary">
            No distinctive entity is shared across the searches in this case. That is a valid result - “no link” is an answer.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-muted">
                  <th className="p-3 font-medium">Link</th>
                  <th className="p-3 font-medium">Evidence</th>
                  <th className="p-3 font-medium">Confidence</th>
                  <th className="p-3 font-medium">Could also be explained by</th>
                </tr>
              </thead>
              <tbody>
                {report.evidence.map((e) => (
                  <tr key={e.key} className="border-b border-line/60 align-top">
                    <td className="p-3">
                      <div className="text-ink">{e.label}</div>
                      <code className="font-mono text-[12px] text-brand-soft">{e.value}</code>
                    </td>
                    <td className="p-3 text-ink-secondary">{e.evidence}</td>
                    <td className="p-3"><ConfidenceBadge level={BAND_TO_LEVEL[e.confidence]} /></td>
                    <td className="p-3 text-[12px] text-ink-secondary">{e.alternative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Infrastructure */}
      {report.infrastructure.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-ink">Infrastructure observed</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.infrastructure.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-bg-card px-4 py-2.5 text-sm">
                <span className="text-ink-secondary">{f.label}</span>
                <span className="flex items-center gap-2"><code className="font-mono text-ink">{f.value}</code><span className="text-[11px] text-ink-muted">{f.source}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Host conduct - documented, cited public-record conduct of the hosts */}
      {report.hostConduct.length > 0 && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-ink">Host conduct - documented public record</h2>
          <p className="mb-3 text-[12px] text-ink-muted">Documented conduct of the hosting infrastructure in this case (court records, watchdog designations). High confidence - public record.</p>
          {report.hostConduct.map((h) => (
            <div key={h.org} className="mb-3 rounded-xl border border-risk-high/30 bg-bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">{h.org}{h.country ? ` · ${h.country}` : ""}</span>
                <ConfidenceBadge level="High" />
              </div>
              {h.summary && <p className="mt-1 text-[13px] text-ink-secondary">{h.summary}</p>}
              <ul className="mt-3 space-y-2">
                {h.findings.map((f, i) => (
                  <li key={i} className="rounded-lg border border-line bg-bg-elev p-3">
                    <div className="flex items-center gap-2">
                      {f.severity === "high" && <span className="rounded bg-risk-high/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-risk-high">Severe</span>}
                      <span className="text-sm font-medium text-ink">{f.label}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-secondary">{f.detail}</p>
                    <div className="mt-1 text-[11px] text-ink-muted">Sources: {f.sources.join(" · ")}</div>
                  </li>
                ))}
              </ul>
              {h.coHostedExtremist.length > 0 && (
                <div className="mt-3 rounded-lg border border-risk-high/25 bg-risk-high/5 p-3">
                  <div className="label-muted mb-1 text-risk-high">Severe context flag - co-hosted domains</div>
                  <div className="flex flex-wrap gap-1.5">
                    {h.coHostedExtremist.map((d, i) => <code key={i} className="rounded border border-risk-high/30 px-1.5 py-0.5 font-mono text-[12px] text-risk-high">{d.domain}</code>)}
                  </div>
                  <p className="mt-2 text-[11px] text-ink-secondary">{h.clientCaveat}</p>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Gaps */}
      <section className="rounded-2xl border border-line bg-bg-card p-6">
        <div className="label-muted mb-2">Open gaps &amp; caveats</div>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-secondary">
          {report.gaps.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      </section>

      {/* Mono footer */}
      <div className="border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] text-ink-secondary">
          <span>TruthLens · Case Summary Report</span>
          <span className="text-ink-muted">{fmtDate(report.generatedAt)} · decision-support, never a verdict</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{report.disclaimer}</p>
      </div>
    </div>
  );
}
