"use client";

// CaseBoard - the conclusions layer of the Link Board. Reads a FindingsReport
// (built from the cross-search clue index) and presents it as an investigation
// board: a banded "were connections found?" banner, ranked LEADS (each with
// evidence + an innocent alternative + next-step pivots into other tools), and
// CLUSTERS of transitively-linked searches. Every claim is a band, not a verdict.

import { useMemo } from "react";
import Link from "next/link";
import { Pin, Download, FileText, ExternalLink, ArrowUpRight, Layers } from "lucide-react";
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/ConfidenceBadge";
import { buildFindings, findingsToMarkdown, type Band, type Finding } from "@/lib/clues/findings";

// Band -> the "red string" accent. High reads as a strong, taut red thread;
// weaker leads use thinner, cooler threads.
const STRING: Record<Band, string> = {
  High: "border-l-risk-high",
  Medium: "border-l-risk-unknown",
  Low: "border-l-white/25",
};
const DOT: Record<Band, string> = {
  High: "bg-risk-high",
  Medium: "bg-risk-unknown",
  Low: "bg-white/40",
};

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function CaseBoard({ refreshKey = 0 }: { refreshKey?: number }) {
  // Rebuilt whenever the parent bumps refreshKey (e.g. after a new comparison).
  const report = useMemo(() => buildFindings(), [refreshKey]);

  const exportBrief = () => download("linkboard-case-brief.md", findingsToMarkdown(report), "text/markdown");
  const exportCsv = () => {
    const rows: string[][] = [["band", "shared_entity", "value", "linked_searches", "next_steps"]];
    for (const f of report.findings) {
      rows.push([f.band, f.entityLabel, f.value, f.searches.map((s) => s.label).join(" | "), f.nextSteps.map((n) => n.label).join(" | ")]);
    }
    download("linkboard-leads.csv", rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  };

  const hasLeads = report.findings.length > 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(169,139,240,0.06),transparent_55%)] p-4">
      {/* Header banner - the first answer: were connections found? */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Pin className="mt-0.5 h-5 w-5 -rotate-12 text-brand-soft" />
          <div>
            <div className="font-display text-lg font-bold">Case board</div>
            {hasLeads ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">
                <span className="text-ink"><b>{report.findings.length}</b> lead{report.findings.length === 1 ? "" : "s"}</span>
                <span>across <b className="text-ink">{report.linkedSearches}</b> of {report.searchCount} searches</span>
                {report.clusters.length > 0 && <span>· {report.clusters.length} cluster{report.clusters.length === 1 ? "" : "s"}</span>}
                {report.strongest && <>· strongest <ConfidenceBadge level={report.strongest as ConfidenceLevel} /></>}
              </div>
            ) : (
              <div className="mt-0.5 text-sm text-ink-secondary">
                <span className="text-ink">No connections found yet</span> across {report.searchCount} saved search{report.searchCount === 1 ? "" : "es"} — a valid, common result. Run more searches; shared infrastructure will surface here.
              </div>
            )}
          </div>
        </div>
        {hasLeads && (
          <div className="flex items-center gap-3 text-xs">
            <button onClick={exportBrief} className="inline-flex items-center gap-1 text-brand-soft hover:underline"><FileText className="h-3.5 w-3.5" /> Case brief</button>
            <button onClick={exportCsv} className="inline-flex items-center gap-1 text-brand-soft hover:underline"><Download className="h-3.5 w-3.5" /> CSV</button>
          </div>
        )}
      </div>

      {/* Clusters - the distinct stories in the board */}
      {report.clusters.length > 0 && (
        <div className="mt-4">
          <div className="label-muted mb-1.5 flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Clusters</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.clusters.map((c) => (
              <div key={c.id} className={`rounded-lg border border-white/10 border-l-2 ${STRING[c.band]} bg-white/[0.02] p-2.5`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">Cluster {c.id + 1} · {c.searches.length} searches</span>
                  <ConfidenceBadge level={c.band as ConfidenceLevel} />
                </div>
                <div className="mt-1 truncate text-xs text-ink-secondary" title={c.searches.map((s) => s.label).join(", ")}>
                  {c.searches.map((s) => s.label).join(" · ")}
                </div>
                <div className="mt-1 text-[11px] text-ink-muted">bound by: {c.bindings.map((b) => b.label).join("; ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leads - ranked, each with evidence + alternative + next steps */}
      {hasLeads && (
        <div className="mt-4 space-y-2.5">
          <div className="label-muted">Leads (most discriminating first)</div>
          {report.findings.map((f) => <LeadCard key={f.id} f={f} />)}
        </div>
      )}

      <p className="mt-4 text-[11px] text-ink-secondary">
        Leads are indicators, not conclusions - each carries an innocent alternative. Nodes are infrastructure/accounts, never people. Saved in this browser; grows as you run the tools.
      </p>
    </div>
  );
}

function LeadCard({ f }: { f: Finding }) {
  return (
    <div className={`relative rounded-xl border border-white/10 border-l-[3px] ${STRING[f.band]} bg-white/[0.02] p-3`}>
      <span className={`absolute -left-[5px] top-3 h-2 w-2 rounded-full ${DOT[f.band]} ring-2 ring-bg`} />
      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge level={f.band as ConfidenceLevel} />
        <span className="text-sm font-semibold text-ink">{f.entityLabel}:</span>
        <span className="break-all font-mono text-sm text-brand-soft">{f.value}</span>
        <span className="ml-auto text-[11px] text-ink-muted">{f.searches.length} searches</span>
      </div>

      {/* which searches this links - the "red string" between pins */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {f.searches.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            {i > 0 && <span className="text-ink-muted">↔</span>}
            <span className="max-w-[220px] truncate rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-ink" title={s.label}>{s.label}</span>
          </span>
        ))}
      </div>

      <div className="mt-2 text-xs text-ink-secondary">{f.evidence}</div>
      <div className="mt-1 text-xs text-ink-secondary"><span className="text-ink-muted">Could also be:</span> {f.alternative}</div>

      {f.nextSteps.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-muted">Next:</span>
          {f.nextSteps.map((n) =>
            n.external ? (
              <a key={n.href} href={n.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-ink transition hover:bg-white/[0.06]">
                {n.label} <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            ) : (
              <Link key={n.href} href={n.href}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-ink transition hover:bg-white/[0.06]">
                {n.label} <ArrowUpRight className="h-3 w-3 opacity-70" />
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
