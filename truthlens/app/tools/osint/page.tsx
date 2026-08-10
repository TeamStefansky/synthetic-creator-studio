"use client";

// OSINT — the installed influence-operation investigation tool. Two panels:
//  (1) Watchlist: the operator-curated documented clusters (Portal Kombat,
//      CopyCop, PAPERWALL, the co-residence tripwire) with HONEST per-rule tool
//      coverage (live vs not configured);
//  (2) Report compiler: fills the 14-section IC-style template, enforcing its
//      invariants (BLUF confidence == Section 10; org-level attribution; honest
//      "Not assessed" for empty sections). Compiled Markdown; copy or print.

import { useEffect, useState } from "react";
import { Crosshair, ShieldCheck, ShieldAlert, FileText, Copy, Printer, Loader2 } from "lucide-react";
import ToolIntro from "@/components/ToolIntro";
import Disclaimer from "@/components/Disclaimer";

type Rule = {
  id: string; cluster: string; attribution: string; reporting: string[];
  confidence: "high" | "moderate" | "low"; toolsLive: string[]; toolsNotConfigured: string[];
  coverage: string; notes: string;
};

const CONF_CLS: Record<string, string> = { high: "text-risk-high", moderate: "text-risk-unknown", low: "text-ink-secondary" };

export default function OsintPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [tab, setTab] = useState<"watchlist" | "pivot" | "report">("watchlist");

  // pivot panel
  const [pKind, setPKind] = useState("adsense_id");
  const [pValue, setPValue] = useState("");
  const [pivot, setPivot] = useState<any>(null);
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState("");

  const runPivot = async () => {
    setPBusy(true); setPErr(""); setPivot(null);
    try {
      const r = await fetch("/api/osint-watch/pivot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: pKind, value: pValue.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Pivot failed");
      setPivot(d);
    } catch (e: any) { setPErr(e.message); } finally { setPBusy(false); }
  };

  // report compiler fields
  const [f, setF] = useState({
    network_name: "", cluster: "", seed: "", assessed_actor: "Undetermined",
    overall_confidence: "Low", executive_summary: "", narrative_analysis: "", gaps: "", next_steps: "",
  });
  const [report, setReport] = useState<{ markdown: string; valid: boolean; violations: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/osint-watch").then((r) => r.json()).then((d) => setRules(d.rules || [])).catch(() => setRules([]));
  }, []);

  const usePreset = (r: Rule) => {
    setTab("report");
    setF((p) => ({
      ...p, cluster: r.cluster, assessed_actor: r.attribution,
      overall_confidence: r.confidence === "high" ? "High" : r.confidence === "moderate" ? "Moderate" : "Low",
      tools_live: r.toolsLive.join(", "),
    } as any));
  };

  const compile = async () => {
    setBusy(true); setErr(""); setReport(null);
    try {
      const r = await fetch("/api/osint-watch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Compile failed");
      setReport(d);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const set = (k: string) => (e: any) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Crosshair className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">OSINT</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
          Influence-operation investigation: a curated watchlist of documented disinformation clusters and a
          compiler for the 14-section, Admiralty-graded report. Attribution is organization/campaign-level with cited
          reporting — never a private individual. All checks are passive and open-source.
        </p>
      </div>

      <div className="no-print flex gap-2">
        <button onClick={() => setTab("watchlist")} className={`rounded-lg px-3 py-1.5 text-sm ${tab === "watchlist" ? "bg-bg-elev text-white" : "text-ink-secondary hover:text-white"}`}>Watchlist</button>
        <button onClick={() => setTab("pivot")} className={`rounded-lg px-3 py-1.5 text-sm ${tab === "pivot" ? "bg-bg-elev text-white" : "text-ink-secondary hover:text-white"}`}>Pivot</button>
        <button onClick={() => setTab("report")} className={`rounded-lg px-3 py-1.5 text-sm ${tab === "report" ? "bg-bg-elev text-white" : "text-ink-secondary hover:text-white"}`}>Report compiler</button>
      </div>

      {tab === "pivot" && (
        <div className="space-y-4">
          <div className="card flex flex-col gap-2 sm:flex-row">
            <select value={pKind} onChange={(e) => setPKind(e.target.value)} className="rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft">
              <option value="adsense_id">AdSense pub id</option>
              <option value="ga_id">Google Analytics id</option>
              <option value="gtm_id">GTM id</option>
              <option value="code">Shared code string</option>
              <option value="domain">Domain (CT + subdomains)</option>
            </select>
            <input value={pValue} onChange={(e) => setPValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runPivot(); }} placeholder="e.g. ca-pub-5378976189690174" className="min-w-0 flex-1 rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" />
            <button onClick={runPivot} disabled={pBusy || pValue.trim().length < 3} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-medium text-white shadow-glow disabled:opacity-50">{pBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Run pivot</button>
          </div>
          {pErr && <div className="card border-risk-high/30 text-sm text-risk-high">{pErr}</div>}
          {pivot && (
            <div className="space-y-3">
              <div className="card">
                <div className="flex flex-wrap gap-1.5">
                  {pivot.results.map((r: any) => (
                    <span key={r.tool} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${r.connected ? "border-risk-legit/30 text-risk-legit" : "border-line text-ink-muted"}`}>
                      {r.connected ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}{r.tool}{r.connected ? ` · ${r.count ?? r.members.length}` : " · not connected"}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="label-muted mb-2">{pivot.members.length} member domain(s) — co-behavior lead, not proof of shared operation</div>
                {pivot.members.length === 0 ? (
                  <p className="text-sm text-ink-secondary">No members returned{pivot.connectedTools.length === 0 ? " — no providers connected. Connect a key (see below) to run this pivot." : "."}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">{pivot.members.slice(0, 200).map((d: string) => <code key={d} className="rounded border border-line px-1.5 py-0.5 font-mono text-[12px] text-ink">{d}</code>)}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "watchlist" && (
        <div className="space-y-3">
          {rules == null ? <div className="card text-sm text-ink-secondary">Loading watchlist…</div>
            : rules.length === 0 ? <div className="card text-sm text-ink-secondary">No rules installed.</div>
            : rules.map((r) => (
              <div key={r.id} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-ink">{r.cluster}</div>
                  <span className={`text-[12px] font-semibold uppercase ${CONF_CLS[r.confidence]}`}>{r.confidence} confidence</span>
                </div>
                <div className="text-[13px] text-ink-secondary">{r.attribution}</div>
                <div className="text-[11px] text-ink-muted">Reporting: {r.reporting.join(" · ")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.toolsLive.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded border border-risk-legit/30 px-1.5 py-0.5 text-[11px] text-risk-legit"><ShieldCheck className="h-3 w-3" />{t}</span>)}
                  {r.toolsNotConfigured.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted"><ShieldAlert className="h-3 w-3" />{t} · not connected</span>)}
                </div>
                <div className="text-[12px] text-ink-secondary">{r.coverage}</div>
                <div className="border-t border-line pt-2 text-[12px] text-ink-soft">{r.notes}</div>
                <button onClick={() => usePreset(r)} className="text-[12px] text-brand-soft hover:underline">Start a report from this cluster →</button>
              </div>
            ))}
        </div>
      )}

      {tab === "report" && (
        <div className="space-y-4">
          <div className="card grid gap-3 no-print sm:grid-cols-2">
            <label className="text-sm">Network name<input value={f.network_name} onChange={set("network_name")} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" placeholder="e.g. Portal Kombat expansion" /></label>
            <label className="text-sm">Cluster<input value={f.cluster} onChange={set("cluster")} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" /></label>
            <label className="text-sm">Seed indicator(s)<input value={f.seed} onChange={set("seed")} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" placeholder="domain / ASN / handle" /></label>
            <label className="text-sm">Assessed actor (org/campaign)<input value={f.assessed_actor} onChange={set("assessed_actor")} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" /></label>
            <label className="text-sm">Overall confidence
              <select value={f.overall_confidence} onChange={set("overall_confidence")} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft">
                <option>High</option><option>Moderate</option><option>Low</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">Executive summary<textarea value={f.executive_summary} onChange={set("executive_summary")} rows={2} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" /></label>
            <label className="text-sm sm:col-span-2">Narrative analysis<textarea value={f.narrative_analysis} onChange={set("narrative_analysis")} rows={2} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" /></label>
            <label className="text-sm">Intelligence gaps<textarea value={f.gaps} onChange={set("gaps")} rows={2} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" /></label>
            <label className="text-sm">Next collection steps<textarea value={f.next_steps} onChange={set("next_steps")} rows={2} className="mt-1 w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand-soft" /></label>
            <div className="sm:col-span-2">
              <button onClick={compile} disabled={busy || !f.network_name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-medium text-white shadow-glow disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Compile report
              </button>
            </div>
          </div>

          {err && <div className="card border-risk-high/30 text-sm text-risk-high">{err}</div>}

          {report && (
            <div className="card space-y-3">
              {!report.valid && (
                <div className="rounded-lg border border-risk-high/30 bg-risk-high/5 p-3 text-[13px] text-risk-high no-print">
                  <div className="font-medium">Template invariants not satisfied:</div>
                  <ul className="mt-1 list-disc pl-5">{report.violations.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              <div className="flex items-center gap-2 no-print">
                <button onClick={() => navigator.clipboard?.writeText(report.markdown)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white"><Copy className="h-3.5 w-3.5" /> Copy Markdown</button>
                <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white"><Printer className="h-3.5 w-3.5" /> Print / PDF</button>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-line bg-bg-sunken p-4 text-[12px] leading-relaxed text-ink-soft">{report.markdown}</pre>
            </div>
          )}
        </div>
      )}

      <div className="no-print">
        <ToolIntro
          what={<>A curated <span className="text-ink">watchlist</span> of documented influence-operation clusters (Russia-aligned Portal Kombat &amp; CopyCop, China-linked PAPERWALL, and a cyber↔IO co-residence tripwire) plus a <span className="text-ink">report compiler</span> for the 14-section, Admiralty-graded investigation template.</>}
          steps={[
            <>Browse the watchlist — each rule shows which tools are <span className="text-ink">live vs not connected</span> here.</>,
            <>Start a report from a cluster (prefills attribution + confidence) or from scratch.</>,
            <>Compile — the template’s invariants are enforced; copy or print the result.</>,
          ]}
          note="Attribution is organization/campaign-level with cited reporting, never a private individual. Paid selectors (SecurityTrails, urlscan Pro, reverse-AdSense, Recorded Future) render 'not connected' until their keys are set — crt.sh is keyless and live."
        />
      </div>

      <Disclaimer />
    </div>
  );
}
