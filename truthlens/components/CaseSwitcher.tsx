"use client";

// Case switcher - the "Chrome profile" selector. Shows the active case; pick
// another and every new search links to it; create a case inline; jump to the
// manager. Browser-local (localStorage), so it works with zero config.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Check, Plus, ChevronDown, Layers } from "lucide-react";
import {
  listCasebooks, getActiveCase, setActiveCase, clearActiveCase, createCasebook,
} from "@/lib/casebook/store";
import type { Casebook } from "@/lib/casebook/types";

export default function CaseSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<Casebook[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => { setCases(listCasebooks()); setActive(getActiveCase()); };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("tl:casebook-change", onChange);
    window.addEventListener("storage", onChange);
    return () => { window.removeEventListener("tl:casebook-change", onChange); window.removeEventListener("storage", onChange); };
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const activeCase = cases.find((c) => c.id === active);

  const create = () => {
    const cb = createCasebook(name || "New case");
    setName(""); setCreating(false); setOpen(false); refresh();
    router.push(`/casebook/${cb.id}`);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg-elev px-2.5 py-2 text-left text-sm transition hover:border-brand-soft/40"
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
          style={{ background: activeCase?.color || "linear-gradient(135deg,#6E8BFF,#A98BF0)" }}
        >
          {activeCase ? activeCase.name.slice(0, 1).toUpperCase() : <Layers className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wider text-ink-muted">Active case</span>
          <span className="block truncate text-ink">{activeCase ? activeCase.name : "None - searches unfiled"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-secondary" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-line bg-bg-card shadow-xl">
          <div className="max-h-64 overflow-y-auto scroll-thin py-1">
            <button
              onClick={() => { clearActiveCase(); setOpen(false); refresh(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-secondary transition hover:bg-white/5"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line"><Layers className="h-3.5 w-3.5" /></span>
              <span className="flex-1">No case (unfiled)</span>
              {!active && <Check className="h-4 w-4 text-brand-soft" />}
            </button>
            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveCase(c.id); setOpen(false); refresh(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/5"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: c.color }}>
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{c.name}</span>
                  <span className="block text-[11px] text-ink-muted">{c.checkIds.length} search{c.checkIds.length === 1 ? "" : "es"}</span>
                </span>
                {active === c.id && <Check className="h-4 w-4 shrink-0 text-brand-soft" />}
              </button>
            ))}
          </div>

          <div className="border-t border-line p-2">
            {creating ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus value={name} onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
                  placeholder="Case name…"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg-elev px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-soft"
                />
                <button onClick={create} className="rounded-lg bg-gradient-brand px-2.5 py-1.5 text-sm font-medium text-white">Add</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setCreating(true)} className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-secondary transition hover:bg-white/5 hover:text-white">
                  <Plus className="h-4 w-4" /> New case
                </button>
                <button onClick={() => { setOpen(false); router.push("/casebook"); }} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-secondary transition hover:bg-white/5 hover:text-white">
                  <FolderOpen className="h-4 w-4" /> Manage
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
