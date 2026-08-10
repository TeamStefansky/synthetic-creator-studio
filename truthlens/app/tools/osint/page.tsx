"use client";

// OSINT - query-driven investigation. Write a QUERY (a domain, an ASN, a shared
// AdSense/GA id, or a network name); the tool goes out and collects from every
// live source (crt.sh CT logs, homepage trackers + reverse-lookup pivots,
// documented host conduct, and a curated-watchlist match), then compiles the
// 14-section report in the designed, printable layout. Runs as a background job
// so you can switch tools while it works.

import { useState } from "react";
import { Crosshair, Loader2, Printer, Copy, ShieldCheck, ShieldAlert, FolderPlus } from "lucide-react";
import ToolIntro from "@/components/ToolIntro";
import Disclaimer from "@/components/Disclaimer";
import OsintReport from "@/components/OsintReport";
import { startFetchJob } from "@/lib/jobs/store";
import { useJob } from "@/lib/jobs/useJobs";
import { recordSearch } from "@/lib/clues/record";
import { getActiveCase, listCasebooks } from "@/lib/casebook/store";

export default function OsintPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"query" | "brief">("query");
  const [jobId, setJobId] = useState<string | null>(null);
  const [rawView, setRawView] = useState(false);
  const [error, setError] = useState("");
  const job = useJob(jobId, "osint");
  const loading = job?.status === "running";
  const data = job?.status === "done" ? (job.result as any) : null;
  const jobError = job?.status === "error" ? job.error : "";

  const run = () => {
    const q = query.trim();
    if (mode === "brief") {
      if (q.length < 10) { setError("Paste a brief (the tool extracts selectors from it)."); return; }
      setError("");
      const id = startFetchJob({
        tool: "osint", href: "/tools/osint", input: q.slice(0, 60), label: "OSINT · brief",
        url: "/api/osint-research", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: q }) },
      });
      setJobId(id); return;
    }
    if (q.length < 3) { setError("Enter a query (≥ 3 characters)."); return; }
    setError("");
    const id = startFetchJob({
      tool: "osint", href: "/tools/osint", input: q, label: `OSINT · ${q}`,
      url: "/api/osint-research", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) },
    });
    setJobId(id);
  };

  const report = data?.report;
  const findings = data?.findings;
  const annex = data?.annex;
  const [saved, setSaved] = useState("");

  const saveToCase = () => {
    if (!report) return;
    const active = getActiveCase();
    const caseName = listCasebooks().find((c) => c.id === active)?.name;
    // recordSearch auto-links to the active case (lib/clues/record).
    recordSearch("osint", query.trim(), `OSINT · ${query.trim()}`, { report, findings, annex }, report.input?.overall_confidence);
    setSaved(active ? `Saved to case “${caseName}”.` : "Saved to History. Set an active case in the sidebar to file it.");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print">
        <div className="flex items-center gap-2">
          <Crosshair className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">OSINT</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
          Write a query - a domain, an ASN, a shared AdSense/GA id, or a network name. The tool goes out, collects from
          every source that is live, and compiles the 14-section investigation report. Passive and open-source; attribution
          is organization/campaign-level with cited reporting, never a private individual.
        </p>
      </div>

      <div className="no-print card space-y-2">
        <div className="flex gap-2">
          <button onClick={() => setMode("query")} className={`rounded-lg px-3 py-1 text-xs ${mode === "query" ? "bg-bg-elev text-white" : "text-ink-secondary hover:text-white"}`}>Single query</button>
          <button onClick={() => setMode("brief")} className={`rounded-lg px-3 py-1 text-xs ${mode === "brief" ? "bg-bg-elev text-white" : "text-ink-secondary hover:text-white"}`}>Brief (paste a full tasking)</button>
        </div>
        {mode === "query" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }}
              placeholder="e.g. techforpalestine.org · AS44925 · ca-pub-5378976189690174 · Portal Kombat"
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none focus:border-brand-soft"
            />
            <button onClick={run} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}{loading ? "Researching…" : "Research"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={query} onChange={(e) => setQuery(e.target.value)} rows={7}
              placeholder="Paste a full investigation brief. The tool extracts every selector (AdSense pub-ids, ASNs, GA/GTM ids, domains), runs each pivot, and merges one report."
              className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none focus:border-brand-soft"
            />
            <button onClick={run} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}{loading ? "Researching…" : "Research the brief"}
            </button>
          </div>
        )}
      </div>

      {(error || jobError) && <div className="no-print card border-risk-high/30 text-sm text-risk-high">{error || jobError}</div>}
      {loading && <div className="no-print card flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Collecting in the background - you can switch tools; the report will be waiting here and in the scans tray.</div>}

      {findings && (
        <div className="no-print card space-y-2">
          <div className="label-muted">Collection log - query classified as {findings.kind}{findings.watchlist ? ` · watchlist: ${findings.watchlist}` : ""}</div>
          <ul className="space-y-0.5 text-[12px] text-ink-secondary">{(findings.log || []).map((l: string, i: number) => <li key={i}>· {l}</li>)}</ul>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(findings.toolsLive || []).map((t: string) => <span key={t} className="inline-flex items-center gap-1 rounded border border-risk-legit/30 px-1.5 py-0.5 text-[11px] text-risk-legit"><ShieldCheck className="h-3 w-3" />{t}</span>)}
            {(findings.toolsNotConfigured || []).map((t: string) => <span key={t} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted"><ShieldAlert className="h-3 w-3" />{t} · not connected</span>)}
          </div>
        </div>
      )}

      {report && (
        <div className="space-y-3">
          <div className="no-print flex items-center gap-2">
            {!report.valid && <span className="text-[12px] text-risk-high">Template invariants: {report.violations.join("; ")}</span>}
            <button onClick={() => setRawView((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white">{rawView ? "Designed view" : "Raw Markdown"}</button>
            <button onClick={() => navigator.clipboard?.writeText(report.markdown + (annex?.markdown ? "\n\n" + annex.markdown : ""))} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white"><Copy className="h-3.5 w-3.5" /> Copy Markdown</button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white"><Printer className="h-3.5 w-3.5" /> Print / PDF</button>
            <button onClick={saveToCase} className="inline-flex items-center gap-1 rounded-lg border border-brand-soft/40 px-2.5 py-1.5 text-xs text-brand-soft hover:bg-white/5"><FolderPlus className="h-3.5 w-3.5" /> Save to case</button>
            {saved && <span className="text-[11px] text-ink-muted">{saved}</span>}
          </div>
          {rawView
            ? <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-line bg-bg-sunken p-4 text-[12px] leading-relaxed text-ink-soft">{report.markdown}{annex?.markdown ? "\n\n" + annex.markdown : ""}</pre>
            : <OsintReport input={report.input} annex={annex} />}
        </div>
      )}

      <div className="no-print">
        <ToolIntro
          what={<>One query in, a full investigation out. The tool classifies the seed, runs <span className="text-ink">crt.sh CT logs</span>, extracts <span className="text-ink">homepage trackers</span> and reverse-looks-them-up, checks <span className="text-ink">documented host conduct</span> and the <span className="text-ink">curated watchlist</span>, then compiles the 14-section, Admiralty-graded report.</>}
          steps={[
            <>Type a domain, ASN, shared AdSense/GA id, or network name.</>,
            <>The tool collects from every live source - not-connected ones are shown honestly.</>,
            <>Read (or print to PDF) the compiled report; confidence is derived from the evidence.</>,
          ]}
          note="Passive, open-source only. crt.sh is keyless and always on; reverse-lookup/passive-DNS pivots run the moment their provider keys are set. Confidence is computed in code, never by a model."
        />
      </div>

      <Disclaimer />
    </div>
  );
}
