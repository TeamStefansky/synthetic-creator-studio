"use client";

// Cases - the workspace manager. Each case is a profile that collects the
// searches you run while it's active (switch it in the sidebar). Open a case to
// see its searches and generate one summary report from everything collected.

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus, Trash2, ArrowRight, Check } from "lucide-react";
import {
  listCasebooks, createCasebook, deleteCasebook, getActiveCase, setActiveCase,
} from "@/lib/casebook/store";
import type { Casebook } from "@/lib/casebook/types";
import { fmtDate } from "@/lib/ui";
import Disclaimer from "@/components/Disclaimer";

export default function CasebookPage() {
  const [cases, setCases] = useState<Casebook[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");

  const refresh = () => { setCases(listCasebooks()); setActive(getActiveCase()); };
  useEffect(() => { refresh(); }, []);

  const create = () => {
    if (!name.trim()) return;
    createCasebook(name, subject);
    setName(""); setSubject(""); refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Cases</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          A case is a workspace - like a browser profile. Set one active in the sidebar and every search you run
          links to it automatically. Open a case to review its searches and generate one summary report from everything the system collected.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="label-muted">New case</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="Case name (e.g. Infrastructure link - BtS ↔ TfP)"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none focus:border-brand-soft"
          />
          <button onClick={create} disabled={!name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
        <input
          value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="What is this case about? (optional - shown on the report)"
          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none focus:border-brand-soft"
        />
      </div>

      {cases.length === 0 ? (
        <div className="card text-center text-sm text-ink-secondary">No cases yet. Create one above, then run your searches - they’ll collect here.</div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: c.color }}>
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/casebook/${c.id}`} className="truncate font-medium text-ink hover:text-brand-soft">{c.name}</Link>
                    {active === c.id && <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft/15 px-2 py-0.5 text-[10px] font-medium text-brand-soft"><Check className="h-3 w-3" /> Active</span>}
                  </div>
                  <div className="text-[12px] text-ink-muted">
                    {c.checkIds.length} search{c.checkIds.length === 1 ? "" : "es"} · updated {fmtDate(c.updatedAt)}
                    {c.subject ? ` · ${c.subject}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {active !== c.id && (
                  <button onClick={() => { setActiveCase(c.id); refresh(); }} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary transition hover:border-brand-soft/40 hover:text-white">Set active</button>
                )}
                <Link href={`/casebook/${c.id}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary transition hover:border-brand-soft/40 hover:text-white">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
                <button onClick={() => { if (confirm(`Delete case “${c.name}”? Its searches stay in History.`)) { deleteCasebook(c.id); refresh(); } }} className="rounded-lg border border-line px-2 py-1.5 text-xs text-risk-high/80 transition hover:border-risk-high/40" aria-label="Delete case"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Disclaimer />
    </div>
  );
}
