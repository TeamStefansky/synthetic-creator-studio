"use client";

// THE INVESTIGATOR (layer 05 · P5). A bounded autonomous investigator: seed a set
// of entities + a question, it plans by diagnostic value, collects (read-only),
// integrates into the case machinery, argues against its own conclusion, and
// issues a situation report. Autonomous only to `association`; common-operation is
// proposed for analyst approval; attribution is never reached. Nodes are
// infrastructure, never people.

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Bot, ArrowRight, Download, ShieldCheck, MessageCircle } from "lucide-react";
const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), { ssr: false });
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";
import { buildFindings } from "@/lib/clues/findings";

interface RunResponse {
  record: { status: string; coverage: string; stopCondition?: string; ceiling: string; cycles: number };
  sitrep: { sections: Record<string, string>; markdown: string };
  network: any;
  journal: { entries: { seq: number; cycle: number; type: string; detail: string }[] };
}

const ORDER = ["STATUS", "BOTTOM LINE", "INSIGHTS FROM YOUR SEARCHES", "JUDGMENT", "CHANGED SINCE LAST REPORT", "KEY EVIDENCE", "EXTERNAL ENRICHMENT - OPERATOR", "RECONSTRUCTION", "THE CASE AGAINST", "KEY ASSUMPTIONS", "NEGATIVE EVIDENCE", "GAPS", "WHAT WOULD CHANGE THIS", "NOT PURSUED", "METHOD RELIABILITY", "THE PREMORTEM", "CONCEPTION WATCH"];

const DOMAIN_RE = /\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i;
function firstDomain(label: string): string | null {
  const m = label.replace(/^https?:\/\//, "").match(DOMAIN_RE);
  return m ? m[1].toLowerCase() : null;
}

// A stable, browser-local attribution handle so runs are attributed automatically
// (the frozen rule requires an initiator) - entered once, never re-typed.
function autoHandle(): string {
  if (typeof window === "undefined") return "analyst";
  try {
    let h = localStorage.getItem("tl:investigator:handle");
    if (!h) { h = `analyst-${Math.random().toString(36).slice(2, 8)}`; localStorage.setItem("tl:investigator:handle", h); }
    return h;
  } catch { return "analyst"; }
}

export default function InvestigatorPage() {
  const [seed, setSeed] = useState("");
  const [question, setQuestion] = useState("");
  const [initiator, setInitiator] = useState("");
  const [data, setData] = useState<RunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showJournal, setShowJournal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chat, setChat] = useState<{ role: "you" | "investigator"; text: string }[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);

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

  // Autonomous mode: the agent seeds itself from the analyst's OWN searches
  // (the browser-local cross-search clue index) - no manual link-pasting - and
  // carries the auto-derived insights into the run, then enriches externally and
  // reports like an investigative brief.
  const investigateMySearches = async (silent = false) => {
    const findings = buildFindings();
    if (!findings.findings.length) { if (!silent) setError("No cross-search connections yet - run a few Site Report / Origin / Link Board searches first, then let the investigator work from them."); return; }
    const seeds = [...new Set(findings.findings.flatMap((f) => f.searches.map((s) => firstDomain(s.label)).filter((d): d is string => !!d)))].slice(0, 12);
    if (seeds.length < 2) { if (!silent) setError("Your searches don't yet share enough domain-level entities to investigate. Run a couple more site/origin searches."); return; }
    const insights = findings.findings.slice(0, 12).map((f) => f.evidence);
    const who = initiator.trim() || autoHandle();
    setLoading(true); setError(""); setData(null);
    try {
      const r = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seedEntities: seeds, question: "What connects the things I have been searching, and what does external enrichment reveal?", initiator: who, insights }), cache: "no-store" });
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

  // Ask the investigator - grounded strictly, server-side. Uses the current report
  // when one exists; otherwise falls back to the insights from your own searches so
  // the chat is useful even before a full run. With neither, it answers honestly
  // that there is nothing collected yet.
  const contextForChat = (): string => {
    if (data) return ORDER.map((k) => `## ${k}\n${data.sitrep.sections[k] || ""}`).join("\n");
    const findings = buildFindings();
    if (findings.findings.length) {
      return "## INSIGHTS FROM YOUR SEARCHES\n" + findings.findings.map((f) => `- ${f.evidence}`).join("\n");
    }
    return "";
  };

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    const context = contextForChat();
    if (!context) {
      setChat((c) => [...c, { role: "you", text: question }, { role: "investigator", text: "Nothing collected yet. Run a few Site Report / Origin / Link Board searches (or press “Investigate my searches”) and I’ll answer from what the case actually contains." }]);
      setQ("");
      return;
    }
    setChat((c) => [...c, { role: "you", text: question }]);
    setQ(""); setAsking(true);
    try {
      const r = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, context }), cache: "no-store" });
      const j = await r.json();
      setChat((c) => [...c, { role: "investigator", text: j.answer || j.error || "no answer" }]);
    } catch (e: any) {
      setChat((c) => [...c, { role: "investigator", text: e?.message || "chat failed" }]);
    } finally { setAsking(false); }
  };

  // Fully automatic: attribute the run to a stable local handle and investigate
  // your own searches on load - no fields to fill, no button to press.
  useEffect(() => {
    setInitiator(autoHandle());
    investigateMySearches(true); // silent: no error banner if there's nothing to investigate yet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist any handle the analyst chooses to override with.
  useEffect(() => { if (initiator.trim()) { try { localStorage.setItem("tl:investigator:handle", initiator.trim()); } catch { /* ignore */ } } }, [initiator]);

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
        {/* Primary: fully automatic - runs on your own searches, no fields to fill. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-sm text-ink-secondary">
            <ShieldCheck className="h-4 w-4 text-brand-soft" />
            Runs automatically on your searches - read-only, budgeted, ceiling <span className="text-ink">association</span>, attributed to you.
          </p>
          <button onClick={() => investigateMySearches()} disabled={loading} className="btn shrink-0">
            {loading ? "Investigating…" : <>Investigate my searches <ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>

        {/* Advanced (optional): investigate specific domains instead. */}
        <button onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-brand-soft hover:underline">
          {showAdvanced ? "Hide" : "Advanced:"} investigate specific domains instead
        </button>
        {showAdvanced && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <textarea value={seed} onChange={(e) => { setSeed(e.target.value); setError(""); }} placeholder={"Optional - specific domains (2-12), one per line or comma-separated"} className="h-20 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-sm outline-none focus:border-brand scroll-thin" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question (optional)" className="w-full rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand" />
              <input value={initiator} onChange={(e) => setInitiator(e.target.value)} placeholder="Attribution handle (auto-set)" className="w-full rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand sm:max-w-xs" />
              <button onClick={run} disabled={loading} className="btn shrink-0">{loading ? "…" : <>Run <ArrowRight className="h-4 w-4" /></>}</button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-risk-high">{error}</p>}
      </div>

      {!data && !loading && (
        <ToolIntro
          heading="An investigator you can supervise"
          what={<>Give it a seed set and a question. It works the case like an analyst - plan, collect, integrate, <span className="text-ink">argue against itself</span>, stop when more collection would not change the answer - and hands you a report with its reasoning, what it did not pursue, and what would prove it wrong. A run that concludes <span className="text-ink">&ldquo;no case established&rdquo;</span> is a success.</>}
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
                {data.journal.entries.map((e) => <li key={e.seq}><span className="font-mono text-ink-muted">c{e.cycle} {e.type}</span> - {e.detail}</li>)}
              </ul>
            )}
          </div>

        </div>
      )}

      {/* Ask the investigator - always available; grounded in the report when one
          exists, otherwise in the insights from your own searches. */}
      <div className="card">
        <div className="label-muted mb-2 flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Ask the investigator</div>
        {chat.length > 0 && (
          <div className="mb-2 max-h-72 space-y-2 overflow-y-auto scroll-thin">
            {chat.map((m, i) => (
              <div key={i} className={m.role === "you" ? "text-right" : ""}>
                <div className={`inline-block max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "you" ? "bg-brand/15 text-ink" : "border border-white/10 bg-white/[0.03] text-ink-secondary"}`}>
                  <div className="mb-0.5 text-[10px] uppercase tracking-wide text-ink-muted">{m.role === "you" ? "you" : "investigator"}</div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}
            {asking && <div className="text-xs text-ink-muted">investigator is thinking…</div>}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the investigator - e.g. what connects these? who is the host? what would disprove it?" className="w-full rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand" />
          <button type="submit" disabled={asking || !q.trim()} className="btn shrink-0">{asking ? "…" : "Ask"}</button>
        </form>
        <p className="mt-2 text-[11px] text-ink-secondary">
          {data ? "Answers come only from this report" : "Answers come from the insights in your searches (run an investigation for the full report)"} - never invented, never a private individual, never a verdict. &ldquo;Not in the collected data&rdquo; is a valid answer.
        </p>
      </div>

      <Disclaimer variant="inline" />
    </div>
  );
}
