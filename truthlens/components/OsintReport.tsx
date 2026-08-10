"use client";

// Designed renderer for the 14-section OSINT investigation report - the polished,
// printable layout (classification header, BLUF box, numbered sections, styled
// tables) matching the uploaded PDF, rather than raw Markdown. Fed the normalized
// ReportInput from the compiler; prints to PDF via the app's print CSS.

import type { ReportInput } from "@/lib/osint/report";
import type { ReportAnnex } from "@/lib/osint/annex";

const CONF_CLS: Record<string, string> = { High: "text-risk-high", Moderate: "text-risk-unknown", Low: "text-ink-secondary" };
const NA = "_Not assessed - insufficient collection._";

function isEmpty(v?: string) {
  return !v || !v.trim() || v.trim() === NA || v.trim() === "-";
}

function Prose({ text }: { text?: string }) {
  if (isEmpty(text)) return <p className="text-[13px] italic text-ink-muted">Not assessed - insufficient collection.</p>;
  return <div className="space-y-2 text-[13px] leading-relaxed text-ink-soft">{text!.split(/\n{2,}|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>;
}

// Render markdown-pipe table-row strings into a styled table.
function PipeTable({ headers, rows }: { headers: string[]; rows?: string }) {
  const parsed = (rows || "").split(/\n/).map((l) => l.trim()).filter((l) => l.startsWith("|"))
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  const real = parsed.filter((r) => r.some((c) => c && !/no load-bearing rows|^-*$/i.test(c)));
  if (real.length === 0) return <p className="text-[13px] italic text-ink-muted">No load-bearing rows.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[520px] text-[12px]">
        <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-muted">{headers.map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{real.map((r, i) => <tr key={i} className="border-b border-line/60 align-top">{r.map((c, j) => <td key={j} className="p-2 text-ink-secondary">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-bold text-ink"><span className="text-brand-soft">{n}.</span> {title}</h2>
      {children}
    </section>
  );
}

export default function OsintReport({ input, annex }: { input: ReportInput; annex?: ReportAnnex }) {
  const conf = input.overall_confidence;
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-muted">
          <span className="gradient-text font-bold">TruthLens · OSINT</span>
          <span>Open-source · for research use</span>
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Influence Operation Investigation: {input.network_name || "-"}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Date: {input.date}</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Run: {input.run_id}</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Mode: {input.mode}</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Seed: {input.seed || "-"}</span>
          <span className={`rounded-full border border-line px-2.5 py-1 font-semibold ${CONF_CLS[conf]}`}>Confidence: {conf}</span>
        </div>
        <p className="mt-3 text-[11px] text-ink-muted">Source grading: Admiralty (A–F / 1–6). Attribution is organization/campaign-level with cited reporting - never a private individual. Decision-support, not a verdict.</p>
      </div>

      {/* BLUF */}
      <div className="rounded-2xl border border-risk-unknown/25 bg-bg-card p-6">
        <div className="label-muted mb-2 text-risk-unknown">◆ 1 · BLUF &amp; Executive Summary</div>
        <p className="text-sm leading-relaxed text-ink">
          We assess <span className={`font-semibold ${CONF_CLS[conf]}`}>with {conf} confidence</span> that <span className="text-ink">{input.cluster || "the cluster"}</span> is operated by <span className="text-ink">{input.assessed_actor}</span>, distributing {input.narratives_short || "the observed narratives"} to {input.audience_short || "the observed audience"}; impact is Breakout {input.breakout_category || "Category 1 (not established)"}.
        </p>
        <div className="mt-3"><Prose text={input.executive_summary} /></div>
      </div>

      <Section n={2} title="Scope, Tasking & Key Intelligence Questions"><Prose text={input.scope} /><Prose text={input.kiq_list} /></Section>
      <Section n={3} title="Methodology & Confidence">
        <p className="text-[13px] text-ink-secondary">Frameworks: ABCDE · DISARM · Breakout Scale · Admiralty · ACH.</p>
        <p className="text-[13px] text-ink-secondary">Tools live: {input.tools_live || "none configured"} · Not configured: {input.tools_not_configured || "none"}. Collection: {input.collection_dates || "-"}.</p>
        <p className="text-[12px] text-ink-muted">Fact and assessment are kept visibly separate: tables and Sections 5–6 are observed facts with sources; Sections 1, 4, 7, 9–11 are analytic assessments.</p>
      </Section>
      <Section n={4} title="Actor Mapping - Who Is Behind It"><Prose text={input.actor_narrative} /><PipeTable headers={["Actor / Org", "Role", "Evidence basis", "Confidence"]} rows={input.actor_table_rows} /></Section>
      <Section n={5} title="Asset Inventory - Fake-News Sites & Inauthentic Assets"><PipeTable headers={["Asset", "Type", "Platform", "Status", "Notes / authenticity"]} rows={input.asset_table_rows} /></Section>
      <Section n={6} title="Distribution Infrastructure - The Technical Stack"><Prose text={input.infrastructure_narrative} /><PipeTable headers={["Selector / Indicator", "Value", "Linked assets", "Pivot type", "Collected"]} rows={input.infra_table_rows} /><p className="text-[12px] text-ink-muted">Underground / commercial stack: {isEmpty(input.underground_findings_or_none) ? "None - dark-web module did not run." : input.underground_findings_or_none}</p></Section>
      <Section n={7} title="Narrative Analysis - The Payload"><Prose text={input.narrative_analysis} /></Section>
      <Section n={8} title="TTPs - DISARM Mapping"><PipeTable headers={["DISARM phase", "Technique observed", "Evidence"]} rows={input.disarm_table_rows} /></Section>
      <Section n={9} title="Impact Assessment"><p className="text-[13px] text-ink-secondary">Breakout Scale: {input.breakout_category || "Category 1 (not established)"}.</p><Prose text={input.impact_evidence} /></Section>
      <Section n={10} title="Attribution Assessment (Competing Hypotheses)">
        <PipeTable headers={["Hypothesis", "Supporting", "Disconfirming", "Verdict"]} rows={input.ach_table_rows} />
        <p className="mt-2 text-sm text-ink">Assessed attribution: <span className="font-semibold text-ink">{input.assessed_actor}</span> - <span className={`font-semibold ${CONF_CLS[conf]}`}>{conf} confidence</span>.</p>
      </Section>
      <Section n={11} title="Comparison to Known Playbooks"><Prose text={input.playbook_comparison} /></Section>
      <Section n={12} title="Intelligence Gaps & Limitations"><Prose text={input.gaps} /></Section>
      <Section n={13} title="Recommended Next Collection Steps"><Prose text={input.next_steps} /></Section>
      <Section n={14} title="Sources"><Prose text={input.sources_numbered_with_links} /></Section>

      {annex && (
        <div className="mt-6 space-y-4 border-t border-line pt-6">
          <h2 className="font-display text-lg font-bold text-ink">Part II - Collection Annex</h2>

          <section className="space-y-2">
            <div className="label-muted">Primary sources</div>
            {annex.primarySources.length === 0 ? <p className="text-[13px] italic text-ink-muted">None collected.</p> : (
              <ol className="space-y-1 text-[12px] text-ink-secondary">
                {annex.primarySources.slice(0, 15).map((s, i) => (
                  <li key={i}><span className="rounded bg-bg-elev px-1 py-0.5 text-[10px] uppercase text-ink-muted">{s.kind}</span> {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-soft hover:underline">{s.label}</a> : s.label}{s.date ? ` (${s.date})` : ""}</li>
                ))}
              </ol>
            )}
          </section>

          <section className="space-y-2">
            <div className="label-muted">Ready-to-run monitor rules</div>
            {annex.watchlistRules.map((r) => (
              <div key={r.id} className="rounded-lg border border-line bg-bg-card p-3 text-[12px]">
                <div className="text-ink"><span className="font-medium">{r.cluster}</span> <span className="text-ink-muted">({r.confidence})</span></div>
                <div className="text-ink-secondary">tools: {r.tools.join(", ")}</div>
                <div className="text-ink-muted">{r.coverage}</div>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <div className="label-muted">Provider RFI - connect to extend coverage</div>
            <ul className="space-y-1 text-[12px]">
              {annex.providerRfi.map((p) => (
                <li key={p.envVar} className={p.status === "connected" ? "text-risk-legit" : "text-ink-secondary"}>
                  {p.status === "connected" ? "☑" : "☐"} <span className="text-ink">{p.provider}</span> <code className="font-mono text-ink-muted">{p.envVar}</code> - {p.wouldAdd}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1">
            <div className="label-muted">Cyber - IO co-residence test</div>
            <p className="text-[12px] text-ink-secondary">{annex.coResidence.result}</p>
          </section>
        </div>
      )}
    </div>
  );
}
