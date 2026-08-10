"use client";

// Global background-jobs tray - a floating indicator (bottom-right) that shows
// scans still running and recently finished, from anywhere in the app. Because
// the job store is a module singleton mounted here in the shell, a scan started
// in one tool keeps running when you move to another, and its result is waiting
// when you return. Click a job to jump to its tool.

import { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertTriangle, X, Activity, ChevronDown } from "lucide-react";
import { useJobs } from "@/lib/jobs/useJobs";
import { dismissJob, clearFinished } from "@/lib/jobs/store";

function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export default function JobsTray() {
  const jobs = useJobs();
  const [open, setOpen] = useState(false);
  const running = jobs.filter((j) => j.status === "running").length;
  if (jobs.length === 0) return null;

  return (
    <div className="no-print fixed bottom-4 right-4 z-40 w-[min(92vw,340px)]">
      {open && (
        <div className="mb-2 overflow-hidden rounded-xl border border-line bg-bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Background scans</span>
            <button onClick={clearFinished} className="text-[11px] text-ink-secondary hover:text-white">Clear finished</button>
          </div>
          <div className="max-h-80 overflow-y-auto scroll-thin py-1">
            {jobs.map((j) => (
              <div key={j.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03]">
                <span className="shrink-0">
                  {j.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-brand-soft" />
                    : j.status === "done" ? <CheckCircle2 className="h-4 w-4 text-risk-legit" />
                    : <AlertTriangle className="h-4 w-4 text-risk-high" />}
                </span>
                <Link href={j.href} onClick={() => setOpen(false)} className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{j.label}</div>
                  <div className="truncate text-[11px] text-ink-muted">
                    {j.status === "running" ? `running · ${ago(j.startedAt)}`
                      : j.status === "error" ? `failed · ${j.error || ""}`
                      : `done · ${ago(j.finishedAt)} ago`}
                  </div>
                </Link>
                <button onClick={() => dismissJob(j.id)} className="shrink-0 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:text-white" aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-auto flex items-center gap-2 rounded-full border border-line bg-bg-card px-3.5 py-2 text-sm shadow-xl transition hover:border-brand-soft/40"
      >
        {running > 0 ? <Loader2 className="h-4 w-4 animate-spin text-brand-soft" /> : <Activity className="h-4 w-4 text-ink-secondary" />}
        <span className="text-ink">{running > 0 ? `${running} scan${running === 1 ? "" : "s"} running` : "Scans"}</span>
        <ChevronDown className={`h-4 w-4 text-ink-secondary transition ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
