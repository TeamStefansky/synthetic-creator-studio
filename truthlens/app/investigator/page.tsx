"use client";

// THE INVESTIGATOR (layer 05 · P5). A bounded autonomous investigator: seed a set
// of entities + a question, it plans by diagnostic value, collects (read-only),
// integrates into the case machinery, argues against its own conclusion, and
// issues a situation report. Autonomous only to `association`; common-operation is
// proposed for analyst approval; attribution is never reached. Nodes are
// infrastructure, never people.

import { useState } from "react";
import dynamic from "next/dynamic";
import { Bot, ArrowRight, Download, ShieldCheck } from "lucide-react";
const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), { ssr: false });
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";

interface RunResponse {
  record: { status: string; coverage: string; stopCondition?: string; ceiling: string; cycles: number };
  sitrep: { sections: Record<string, string>; markdown: string };
  network: any;
  journal: { entries: { seq: number; cycle: number; type: string; detail: string }[] };
}

const ORDER = ["STATUS", "BOTTOM LINE", "JUDGMENT", "CHANGED SINCE LAST REPORT", "KEY EVIDENCE", "RECONSTRUCTION", "THE CASE AGAINST", "KEY ASSUMPTIONS", "NEGATIVE EVIDENCE", "GAPS", "WHAT WOULD CHANGE THIS", "NOT PURSUED", "METHOD RELIABILITY", "THE PREMORTEM", "CONCEPTION WATCH"];

export default function InvestigatorPage() {
  const [seed, setSeed] = useState("");
  const [question, setQuestion] = useState("");
  const [initiator, setInitiator] = useState("");
  const [data, setData] = useState<RunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showJournal, setShowJournal] = useState(false);

  const run = async () => {
    const seedEntities = seed.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
    if (seedEntities.length < 2) { setError("Enter at least two seed entities."); return; }
    if (!initiator.trim()) { setError("An attributed run needs your name/handle (initiator)."); return; }
    setLoading(true); setError(""); setData(null);
    try {
      const r = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seedEntities, question, initiator }), cache: "no-store" });
      const txt = await r.text();
      let j: any; try { j = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || "unreadable response"); }
      if (!r.ok) throw new Error(j.error || `run failed (${r.status})`);
      setData(j);
    } catch (e: any) { setError(e?.message || "run failed"); }
    finally { setLoading(false); }
  };

  const exportReport = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([data.sitrep.markdown], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = "situation-report.md"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">THE <span className="gradient-text">INVESTIGATOR</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          A bounded autonomous investigator that runs in the background: it plans what to collect by
          diagnostic value, gathers it read-only, integrates everything into the case machinery,
          argues against its own leading conclusion, and issues a situation report. Autonomous only to
          <span className="text-ink"> association</span>; higher rungs are proposed for your approval,
          never published. Nodes are infrastructure, never people.
        </p>
      </div>

      <div className="card space-y-2">
        <textarea value={seed} onChange={(e) => { setSeed(e.target.value); setError(""); }} placeholder={"Seed entities (2-12 domains), one per line or comma-separated"} className="h-20 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-sm outline-none focus:border-brand scroll-thin" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question (e.g. are these operated together?)" className="w-full rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand" />
          <input value={initiator} onChange={(e) => setInitiator(e.target.value)} placeholder="Your name/handle (attribution — required)" className="w-full rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand sm:max-w-xs" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs text-ink-secondary"><ShieldCheck className="h-3.5 w-3.5" /> Read-only · budgeted · ceiling: association · a run is attributed and reproducible.</p>
          <button onClick={run} disabled={loading} className="btn shrink-0">{loading ? "Investigating…" : <>Run <ArrowRight className="h-4 w-4" /></>}</button>
        </div>
        {error && <p className="text-sm text-risk-high">{error}</p>}
      </div>

      {!data && !loading && (
        <ToolIntro
          heading="An investigator you can supervise"
          what={<>Give it a seed set and a question. It works the case like an analyst — plan, collect, integrate, <span className="text-ink">argue against itself</span>, stop when more collection would not change the answer — and hands you a report with its reasoning, what it did not pursue, and what would prove it wrong. A run that concludes <span className="text-ink">&ldquo;no case established&rdquo;</span> is a success.</>}
          legend={[
            { label: "Association only", tone: "legit", text: "autonomous to association; higher rungs are proposals for your approval." },
            { label: "Scope-locked", tone: "neutral", text: "discovered entities queue for review; the agent never expands the case." },
            { label: "The case against", tone: "unknown", text: "every report includes the strongest counter-case, in full." },
          ]}
          note="Scheduled background runs reuse the authenticated cron + Upstash; this button runs one pass now."
        />
      )}

      {data && (
        <div className="space-y-4">
          <div className="card border-brand/30 bg-brand/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="label-muted">Situation report · {data.record.status} · {data.record.cycles} cycle(s)</div>
              <button onClick={exportReport} className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline"><Download className="h-3.5 w-3.5" /> Export report</button>
            </div>
          </div>

          {ORDER.map((k) => (
            <div key={k} className="card">
              <div className="label-muted mb-1">{k}</div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink">{data.sitrep.sections[k] || "none established"}</pre>
            </div>
          ))}

          {data.network?.nodes?.length > 1 && (
            <div className="card">
              <div className="label-muted mb-2">Operator network</div>
              <NetworkGraph network={data.network} />
            </div>
          )}

          <div className="card">
            <button onClick={() => setShowJournal((v) => !v)} className="text-xs text-brand-soft hover:underline">{showJournal ? "Hide" : "Show"} reasoning journal ({data.journal.entries.length})</button>
            {showJournal && (
              <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
                {data.journal.entries.map((e) => <li key={e.seq}><span className="font-mono text-ink-muted">c{e.cycle} {e.type}</span> — {e.detail}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
