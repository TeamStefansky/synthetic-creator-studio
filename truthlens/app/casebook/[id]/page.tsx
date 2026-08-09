"use client";

// A single case: its linked searches (attach/remove) and a one-click summary
// report generated from everything the system collected under it. The report is
// built server-side (deterministic + optional LLM bottom line) and prints to PDF
// via the app's print CSS.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FileText, Printer, Loader2, Trash2, Plus, ArrowLeft, Pencil, Check } from "lucide-react";
import {
  getCasebook, updateCasebook, removeCheckFromCase, addCheckToCase, setActiveCase, getActiveCase,
} from "@/lib/casebook/store";
import type { Casebook } from "@/lib/casebook/types";
import { listLocal, type CheckRecord } from "@/lib/check/history";
import type { CaseDossier } from "@/lib/casebook/dossier";
import CaseReport from "@/components/CaseReport";
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/ConfidenceBadge";
import { fmtDate } from "@/lib/ui";

const TYPE_LABEL: Record<string, string> = {
  site: "Site Report", report: "Site Report", post: "Post Check", logs: "Log Analyzer", email: "Email Tracer",
  origin: "Origin Exposure", "origin-map": "Origin Map", mentions: "Brand Mentions", signal: "SIGNAL Grid",
  linkboard: "Link Board", relboard: "Relationship Board", sanctions: "Sanctions Screening", crypto: "Crypto OSINT",
  media: "Media Check", ngo: "Nonprofit Registry", geopolitics: "Geopolitics",
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cb, setCb] = useState<Casebook | undefined>();
  const [allChecks, setAllChecks] = useState<CheckRecord[]>([]);
  const [report, setReport] = useState<CaseDossier | null>(null);
  const [narration, setNarration] = useState<{ source: string; reason?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const refresh = () => { setCb(getCasebook(id)); setAllChecks(listLocal()); };
  useEffect(() => { refresh(); }, [id]);

  const linked = useMemo(() => {
    if (!cb) return [];
    const byId = new Map(allChecks.map((c) => [c.id, c]));
    return cb.checkIds.map((cid) => byId.get(cid)).filter(Boolean) as CheckRecord[];
  }, [cb, allChecks]);

  const unlinked = useMemo(() => {
    if (!cb) return [];
    const set = new Set(cb.checkIds);
    return allChecks.filter((c) => !set.has(c.id));
  }, [cb, allChecks]);

  const generate = async () => {
    if (!cb) return;
    setLoading(true); setError(""); setReport(null);
    try {
      const checks = linked.map((c) => ({ id: c.id, type: c.type, input: c.input, headline: c.headline, level: c.level, result: c.result, createdAt: c.createdAt }));
      const r = await fetch("/api/casebook/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: cb.id, name: cb.name, subject: cb.subject, checks }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Report generation failed");
      setReport(data.report); setNarration(data.narration);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const saveEdit = () => { if (!cb) return; updateCasebook(cb.id, { name: nameDraft || cb.name, subject: subjectDraft }); setEditing(false); refresh(); };

  if (!cb) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="card text-sm text-ink-secondary">Case not found. <Link href="/casebook" className="text-brand-soft">Back to Cases</Link></div>
      </div>
    );
  }

  const isActive = getActiveCase() === cb.id;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header / controls — hidden in print */}
      <div className="no-print space-y-4">
        <Link href="/casebook" className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-white"><ArrowLeft className="h-4 w-4" /> Cases</Link>

        <div className="card space-y-3">
          {editing ? (
            <div className="space-y-2">
              <input autoFocus defaultValue={cb.name} onChange={(e) => setNameDraft(e.target.value)} className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none focus:border-brand-soft" />
              <input defaultValue={cb.subject || ""} onChange={(e) => setSubjectDraft(e.target.value)} placeholder="What is this case about?" className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none focus:border-brand-soft" />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg bg-gradient-brand px-3 py-1.5 text-sm font-medium text-white"><Check className="h-4 w-4" /> Save</button>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-base font-bold text-white" style={{ background: cb.color }}>{cb.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0">
                  <h1 className="truncate font-display text-xl font-bold text-ink">{cb.name}</h1>
                  <div className="text-[12px] text-ink-muted">{linked.length} search{linked.length === 1 ? "" : "es"} · {cb.subject || "no description"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isActive && <button onClick={() => { setActiveCase(cb.id); refresh(); }} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white">Set active</button>}
                <button onClick={() => { setNameDraft(cb.name); setSubjectDraft(cb.subject || ""); setEditing(true); }} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white"><Pencil className="h-3.5 w-3.5" /> Edit</button>
              </div>
            </div>
          )}
        </div>

        {/* Linked searches */}
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <div className="label-muted">Searches in this case</div>
            <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1 text-xs text-brand-soft"><Plus className="h-3.5 w-3.5" /> Add existing</button>
          </div>
          {linked.length === 0 ? (
            <p className="text-sm text-ink-secondary">No searches yet. Set this case active, then run any tool — or add existing searches below.</p>
          ) : (
            <ul className="space-y-1.5">
              {linked.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-bg-elev px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ConfidenceBadge level={(c.level as ConfidenceLevel) || "Unknown"} />
                    <span className="truncate text-sm text-ink">{c.headline}</span>
                    <span className="shrink-0 text-[11px] text-ink-muted">{TYPE_LABEL[c.type] || c.type} · {fmtDate(c.createdAt)}</span>
                  </div>
                  <button onClick={() => { removeCheckFromCase(cb.id, c.id); refresh(); }} className="shrink-0 text-ink-muted hover:text-risk-high" aria-label="Remove from case"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}

          {showAdd && (
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto scroll-thin rounded-lg border border-line p-2">
              {unlinked.length === 0 ? <p className="p-2 text-xs text-ink-muted">No other searches in your history.</p> : unlinked.map((c) => (
                <button key={c.id} onClick={() => { addCheckToCase(cb.id, c.id); refresh(); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-white/5">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-brand-soft" />
                  <span className="truncate text-ink">{c.headline}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-muted">{TYPE_LABEL[c.type] || c.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Generate / print */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={generate} disabled={loading || linked.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {loading ? "Generating…" : report ? "Regenerate report" : "Generate summary report"}
          </button>
          {report && <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm text-ink-secondary transition hover:text-white"><Printer className="h-4 w-4" /> Print / Save PDF</button>}
          {narration && <span className="text-[11px] text-ink-muted">{narration.source === "llm" ? "Bottom line refined by the LLM." : narration.reason}</span>}
        </div>

        {error && <div className="card border-risk-high/30 text-sm text-risk-high">{error}</div>}
      </div>

      {/* The report (prints) */}
      {report && <CaseReport report={report} />}
    </div>
  );
}
