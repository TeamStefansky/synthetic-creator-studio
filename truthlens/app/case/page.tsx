"use client";

// Case wall (layer 03 · P7). Composes the evidence-grounded case for a set of
// domains: a banded bottom line (likelihood AND confidence, separately), the ACH
// matrix, clusters + operator network, timeline (tier badges), the evidence
// ledger, the propagation path (directed vs order-not-established), and the gaps
// register kept SEPARATE from negative evidence and never collapsed. Every claim
// is a band, not a verdict; nodes are infrastructure, never people.

import { useState } from "react";
import dynamic from "next/dynamic";
import { ScrollText, ArrowRight, Download } from "lucide-react";
const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), { ssr: false });
import Disclaimer from "@/components/Disclaimer";
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/ConfidenceBadge";
import ToolIntro from "@/components/ToolIntro";
import type { CaseFile } from "@/lib/case/synthesize";
import { caseBrief } from "@/lib/case/brief";

const CELL: Record<string, string> = { consistent: "bg-risk-legit/25", inconsistent: "bg-risk-high/25", neutral: "bg-white/5" };
const LABEL_TONE: Record<string, string> = { FACT: "text-risk-legit", INFERENCE: "text-brand-soft", ASSUMPTION: "text-risk-unknown", SPECULATION: "text-ink-secondary" };

export default function CaseWallPage() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<{ case: CaseFile; network: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    const domains = input.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
    if (domains.length < 2) { setError("Enter at least two domains."); return; }
    setLoading(true); setError(""); setData(null);
    try {
      const r = await fetch("/api/case", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domains }), cache: "no-store" });
      const txt = await r.text();
      let j: any; try { j = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || "unreadable response"); }
      if (!r.ok) throw new Error(j.error || `case failed (${r.status})`);
      setData(j);
    } catch (e: any) { setError(e?.message || "case failed"); }
    finally { setLoading(false); }
  };

  const cf = data?.case;
  const exportBrief = () => {
    if (!cf) return;
    const url = URL.createObjectURL(new Blob([caseBrief(cf)], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = "case-brief.md"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Case <span className="gradient-text">Synthesis</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Compose an evidence-grounded case from a set of domains: chain-of-custody ledger, time-tiered
          timeline, clusters bounded by their weakest link, a propagation path drawn only where
          timestamps justify a direction, competing hypotheses scored by inconsistency, and negative
          evidence kept separate from gaps. Decision-support, not a verdict - nodes are infrastructure,
          never people.
        </p>
      </div>

      <div className="card">
        <textarea value={input} onChange={(e) => { setInput(e.target.value); setError(""); }}
          placeholder={"Enter 2-12 domains, one per line or comma-separated"}
          className="h-24 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-sm outline-none focus:border-brand scroll-thin" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-ink-secondary">Public data only. Reproducible: same evidence + versions ⇒ same case.</p>
          <button onClick={run} disabled={loading} className="btn shrink-0">{loading ? "Synthesizing…" : <>Build case <ArrowRight className="h-4 w-4" /></>}</button>
        </div>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
      </div>

      {!cf && !loading && (
        <ToolIntro
          heading="What does the evidence actually support?"
          what={<>Where the Link Board answers &ldquo;are these connected?&rdquo;, Case Synthesis answers <span className="text-ink">&ldquo;what happened, in what order, and how sure are we?&rdquo;</span> - with every conclusion carrying its evidence, an alternative, and a falsification list.</>}
          legend={[
            { label: "Likelihood ≠ confidence", tone: "unknown", text: "two separate axes; very likely / low confidence is a valid result." },
            { label: "Gaps ≠ negative evidence", tone: "neutral", text: "what we didn't look for scores nothing; kept separate." },
            { label: "Undetermined", tone: "neutral", text: "a close call is reported as undetermined, never forced." },
          ]}
          note="The narrative reconstruction step requires an LLM key; the structural case is computed deterministically in code without it."
        />
      )}

      {cf && (
        <div className="space-y-6">
          {/* BOTTOM LINE */}
          <div className="card border-brand/30 bg-brand/[0.04]">
            <div className="label-muted mb-1">Bottom line</div>
            <p className="text-sm text-ink">{cf.bottomLine.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-white/15 px-2 py-0.5">rung: <b className="text-ink">{cf.bottomLine.rung}</b></span>
              <span className="rounded-full border border-white/15 px-2 py-0.5">likelihood: <b className="text-ink">{cf.bottomLine.likelihood}</b></span>
              <span className="inline-flex items-center gap-1">confidence: <ConfidenceBadge level={cf.bottomLine.confidence as ConfidenceLevel} /></span>
              {cf.ach.undetermined && <span className="rounded-full border border-risk-unknown/40 bg-risk-unknown/10 px-2 py-0.5 text-risk-unknown">ACH: undetermined</span>}
              <button onClick={exportBrief} className="ml-auto inline-flex items-center gap-1 text-brand-soft hover:underline"><Download className="h-3.5 w-3.5" /> Case brief</button>
            </div>
            {cf.assumptions.critical.length > 0 && (
              <div className="mt-2 rounded-lg border border-risk-unknown/30 bg-risk-unknown/5 p-2 text-xs text-risk-unknown">
                {cf.assumptions.summaryLines.map((s, i) => <div key={i}>{s}</div>)}
              </div>
            )}
          </div>

          {/* CLUSTERS + NETWORK */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <div className="label-muted mb-2">Clusters (weakest-link confidence)</div>
              {cf.clusters.filter((c) => c.members.length > 1).length === 0 ? (
                <p className="text-sm text-ink-secondary">No cluster beyond common-by-default infrastructure. A valid, common result.</p>
              ) : cf.clusters.filter((c) => c.members.length > 1).map((c) => (
                <div key={c.id} className="mb-2 rounded-lg border border-white/10 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{c.members.join(", ")}</span>
                    <ConfidenceBadge level={c.confidence as ConfidenceLevel} />
                  </div>
                  {c.dependsOn && <div className="mt-1 text-xs text-ink-secondary">Depends on: {c.dependsOn.why}</div>}
                  {c.articulationEdges.length > 0 && <div className="mt-0.5 text-[11px] text-risk-unknown">{c.articulationEdges.length} fragile bridge(s)</div>}
                </div>
              ))}
            </div>
            <div className="card">
              <div className="label-muted mb-2">Operator network</div>
              {data?.network?.nodes?.length > 1 ? <NetworkGraph network={data.network} /> : <p className="text-sm text-ink-secondary">No shared infrastructure collected to draw.</p>}
            </div>
          </div>

          {/* ACH MATRIX */}
          <div className="card">
            <div className="label-muted mb-2">Competing hypotheses (ranked by fewest inconsistencies)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="p-1 text-left text-ink-secondary">hypothesis</th>
                  {cf.ach.items.map((it) => <th key={it.id} className={`p-1 ${it.diagnostic ? "text-ink" : "text-ink-muted"}`} title={it.label}>{it.diagnostic ? "◆" : "◇"}</th>)}
                  <th className="p-1 text-right text-ink-secondary">inc.</th></tr></thead>
                <tbody>
                  {cf.ach.rows.map((r) => (
                    <tr key={r.kind}>
                      <td className="p-1 text-ink">{r.label}</td>
                      {cf.ach.items.map((it) => <td key={it.id} className={`h-5 w-5 rounded text-center ${CELL[r.cells[it.id]] || ""}`} title={`${it.label}: ${r.cells[it.id]}`} />)}
                      <td className="p-1 text-right font-mono text-ink">{r.inconsistencies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-ink-secondary">◆ diagnostic · ◇ non-diagnostic. {cf.ach.deceptionCappedReason || cf.ach.note}</p>
          </div>

          {/* TIMELINE */}
          <div className="card">
            <div className="label-muted mb-2">Timeline (earliest observed in collected data - never an origin claim)</div>
            {cf.timeline.entries.length === 0 ? <p className="text-sm text-ink-secondary">No dated events collected.</p> : (
              <ul className="space-y-1 text-xs">
                {cf.timeline.entries.slice(0, 30).map((e) => (
                  <li key={e.itemId} className="flex items-center gap-2">
                    <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono">{e.tier}</span>
                    <span className="text-ink-secondary">{e.at.slice(0, 16).replace("T", " ")}</span>
                    <span className="text-ink">{e.kind}: {e.value.slice(0, 48)}</span>
                    {!e.ordered && <span className="text-[10px] text-risk-unknown">(not orderable)</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* PROPAGATION PATH */}
          {cf.path.edges.length > 0 && (
            <div className="card">
              <div className="label-muted mb-2">Propagation path {cf.path.coverageReason ? `· ${cf.path.coverageReason}` : ""}</div>
              <ul className="space-y-1 text-xs">
                {cf.path.edges.map((e, i) => (
                  <li key={i} className={e.kind === "directed" ? "text-ink" : "text-risk-unknown"}>
                    {e.from} {e.kind === "directed" ? "→" : "-"} {e.to} <span className="text-ink-secondary">· {e.kind === "directed" ? e.reason : "order not established"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* LEDGER */}
          <div className="card">
            <div className="label-muted mb-2">Evidence ledger ({cf.ledger.items.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-ink-secondary"><th className="p-1 text-left">kind</th><th className="p-1 text-left">value</th><th className="p-1">tier</th><th className="p-1">grade</th><th className="p-1">corrob.</th></tr></thead>
                <tbody>
                  {cf.ledger.items.slice(0, 40).map((i) => (
                    <tr key={i.id} className="border-t border-white/5">
                      <td className="p-1 text-ink-secondary">{i.kind}</td>
                      <td className="p-1 text-ink">{i.value.slice(0, 40)}</td>
                      <td className="p-1 text-center font-mono">{i.eventTime?.tier || "-"}</td>
                      <td className="p-1 text-center font-mono">{i.provenances[0]?.sourceGrade}{i.provenances[0]?.infoCredibility}</td>
                      <td className="p-1 text-center font-mono">{new Set(i.provenances.map((p) => p.lineageId)).size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GAPS + NEGATIVE EVIDENCE - separate, always visible */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <div className="label-muted mb-2">Gaps register (zero evidential weight)</div>
              <ul className="space-y-1 text-xs text-ink-secondary">
                {cf.gaps.slice(0, 20).map((g, i) => <li key={i}><span className="rounded bg-white/5 px-1.5 py-0.5">{g.kind}</span> {g.subject} - {g.reason}</li>)}
              </ul>
            </div>
            <div className="card">
              <div className="label-muted mb-2">Negative evidence (counts against a hypothesis)</div>
              <p className="text-sm text-ink-secondary">No adequate predicted-artifact searches were run in this pass, so there is no negative evidence - distinct from the gaps at left. Never conflated.</p>
            </div>
          </div>

          {/* Reconstruction - honest not-connected state */}
          <div className="card">
            <div className="label-muted mb-1">Narrative reconstruction</div>
            <p className="text-sm text-ink-secondary">
              The labeled reconstruction (FACT / INFERENCE / ASSUMPTION / SPECULATION, each cited) requires an LLM key and runs through the deterministic validator. The structural case above is computed without it.
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
              {(["FACT", "INFERENCE", "ASSUMPTION", "SPECULATION"] as const).map((l) => <span key={l} className={`rounded border border-white/10 px-1.5 py-0.5 ${LABEL_TONE[l]}`}>{l}</span>)}
            </div>
          </div>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
