"use client";

// Designed renderer for the 14-section OSINT report - matched to the TruthLens
// intelligence-report design language: dark navy panels, a zero-padded blue
// section index, a headline stat-tile row, mono-styled selectors/ids, an
// amber-accented BLUF and limitations callout, rich asset cards, and a mono
// report footer with primary sources. Fed the normalized ReportInput from the
// compiler (+ optional Part II annex); prints to PDF via the app's print CSS.

import type { ReportInput } from "@/lib/osint/report";
import type { ReportAnnex } from "@/lib/osint/annex";

const CONF_CLS: Record<string, string> = { High: "text-risk-high", Moderate: "text-risk-unknown", Low: "text-ink-secondary" };
const NA = "_Not assessed - insufficient collection._";

function isEmpty(v?: string) {
  return !v || !v.trim() || v.trim() === NA || v.trim() === "-";
}

// Parse markdown pipe rows into cells; drop header/empty markers.
function parseRows(rows?: string): string[][] {
  return (rows || "").split(/\n/).map((l) => l.trim()).filter((l) => l.startsWith("|"))
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
    .filter((r) => r.some((c) => c && !/no load-bearing rows|^-*$/i.test(c)));
}
function countLines(v?: string) {
  return (v || "").split(/\n/).map((l) => l.trim()).filter(Boolean).length;
}

const MONO = /^(AS\d+|ca-pub-|ua-|g-|gtm-|\d{1,3}(\.\d{1,3}){3})/i;
function Cell({ text }: { text: string }) {
  const mono = MONO.test(text) || /\.[a-z]{2,}$/i.test(text.split(" ")[0]);
  return <span className={mono ? "font-mono text-brand-soft" : "text-ink-secondary"}>{text}</span>;
}

function Prose({ text }: { text?: string }) {
  if (isEmpty(text)) return <p className="text-[13px] italic text-ink-muted">Not assessed - insufficient collection.</p>;
  return <div className="space-y-2 text-[13px] leading-relaxed text-ink-soft">{text!.split(/\n{2,}|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>;
}

function PipeTable({ headers, rows }: { headers: string[]; rows?: string }) {
  const real = parseRows(rows);
  if (real.length === 0) return <p className="text-[13px] italic text-ink-muted">No load-bearing rows.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[520px] text-[12px]">
        <thead><tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.12em] text-ink-muted">{headers.map((h) => <th key={h} className="p-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody>{real.map((r, i) => <tr key={i} className="border-b border-line/50 align-top">{r.map((c, j) => <td key={j} className="p-2.5"><Cell text={c} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-card px-5 py-4">
      <div className="font-display text-3xl font-bold gradient-text">{n}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{label}</div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="font-mono text-[12px] text-brand-soft">{String(n).padStart(2, "0")}</div>
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function OsintReport({ input, annex }: { input: ReportInput; annex?: ReportAnnex }) {
  const conf = input.overall_confidence;
  const assetN = parseRows(input.asset_table_rows).length;
  const infraN = parseRows(input.infra_table_rows).length;
  const sourceN = countLines(input.sources_numbered_with_links);

  return (
    <div className="tl-report space-y-6 rounded-2xl bg-bg-base p-1">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-xl font-bold tracking-tight">TRUTH<span className="gradient-text">LENS</span></span>
          <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">Defensive OSINT · Decision-support</span>
        </div>
        <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Influence Operation Investigation</div>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink">{input.network_name || "-"}</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Date: {input.date}</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary">Run: {input.run_id}</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-secondary font-mono">Seed: {input.seed || "-"}</span>
          <span className={`rounded-full border border-line px-2.5 py-1 font-semibold ${CONF_CLS[conf]}`}>Confidence: {conf}</span>
        </div>
      </div>

      {/* BLUF - amber-accented callout */}
      <div className="rounded-2xl border border-risk-unknown/30 bg-bg-card p-6" style={{ borderLeftWidth: 3 }}>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-risk-unknown">◆ Bottom line up front</div>
        <p className="text-sm leading-relaxed text-ink">
          We assess <span className={`font-semibold ${CONF_CLS[conf]}`}>with {conf} confidence</span> that <span className="text-ink">{input.cluster || "the cluster"}</span> is operated by <span className="text-ink">{input.assessed_actor}</span>, distributing {input.narratives_short || "the observed narratives"} to {input.audience_short || "the observed audience"}; impact is Breakout {input.breakout_category || "Category 1 (not established)"}.
        </p>
        <div className="mt-3"><Prose text={input.executive_summary} /></div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={String(assetN)} label="Assets mapped" />
        <Stat n={String(infraN)} label="Infra indicators" />
        <Stat n={String(sourceN)} label="Primary sources" />
        <Stat n="100%" label="Public · passive" />
      </div>

      <Section n={2} title="Scope, Tasking & Key Intelligence Questions"><Prose text={input.scope} /><Prose text={input.kiq_list} /></Section>
      <Section n={3} title="Methodology & Confidence">
        <p className="text-[13px] text-ink-secondary">Frameworks: ABCDE · DISARM · Breakout Scale · Admiralty · ACH.</p>
        <p className="text-[13px] text-ink-secondary">Tools live: <span className="text-risk-legit">{input.tools_live || "none configured"}</span> · Not configured: <span className="text-ink-muted">{input.tools_not_configured || "none"}</span>. Collection: {input.collection_dates || "-"}.</p>
        <p className="text-[12px] text-ink-muted">Fact and assessment are kept visibly separate: tables and Sections 5-6 are observed facts with sources; Sections 1, 4, 7, 9-11 are analytic assessments.</p>
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

      {/* Limitations / gaps - amber callout like the reference design */}
      <div className="rounded-2xl border border-risk-unknown/25 bg-bg-card p-5" style={{ borderLeftWidth: 3 }}>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-risk-unknown">12 · Intelligence gaps &amp; limitations</div>
        <Prose text={input.gaps} />
      </div>

      <Section n={13} title="Recommended Next Collection Steps"><Prose text={input.next_steps} /></Section>
      <Section n={14} title="Sources"><Prose text={input.sources_numbered_with_links} /></Section>

      {annex && (
        <div className="mt-2 space-y-4 rounded-2xl border border-line bg-bg-card p-6">
          <h2 className="font-display text-lg font-bold text-ink">Part II · Collection Annex</h2>

          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Primary sources</div>
            {annex.primarySources.length === 0 ? <p className="text-[13px] italic text-ink-muted">None collected.</p> : (
              <ol className="space-y-1 text-[12px] text-ink-secondary">
                {annex.primarySources.slice(0, 15).map((s, i) => (
                  <li key={i}><span className="rounded bg-bg-elev px-1 py-0.5 text-[10px] uppercase text-ink-muted">{s.kind}</span> {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-soft hover:underline">{s.label}</a> : s.label}{s.date ? ` (${s.date})` : ""}</li>
                ))}
              </ol>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Ready-to-run monitor rules</div>
            {annex.watchlistRules.map((r) => (
              <div key={r.id} className="rounded-lg border border-line bg-bg-elev p-3 text-[12px]">
                <div className="text-ink"><span className="font-medium">{r.cluster}</span> <span className="text-ink-muted">({r.confidence})</span></div>
                <div className="text-ink-secondary">tools: {r.tools.join(", ")}</div>
                <div className="text-ink-muted">{r.coverage}</div>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Provider RFI - connect to extend coverage</div>
            <ul className="space-y-1 text-[12px]">
              {annex.providerRfi.map((p) => (
                <li key={p.envVar} className={p.status === "connected" ? "text-risk-legit" : "text-ink-secondary"}>
                  {p.status === "connected" ? "☑" : "☐"} <span className="text-ink">{p.provider}</span> <code className="font-mono text-ink-muted">{p.envVar}</code> - {p.wouldAdd}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Cyber - IO co-residence test</div>
            <p className="text-[12px] text-ink-secondary">{annex.coResidence.result}</p>
          </section>
        </div>
      )}

      {/* Mono footer */}
      <div className="border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] text-ink-secondary">
          <span>TruthLens · OSINT Intelligence Report</span>
          <span className="text-ink-muted">{input.date} · decision-support, never a verdict</span>
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">Indicators about infrastructure and identifiers - accounts, domains and infrastructure, never a named private individual. Verify every detail before relying on it.</p>
      </div>
    </div>
  );
}
