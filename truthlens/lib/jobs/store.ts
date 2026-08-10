"use client";

// Background-jobs store - a MODULE SINGLETON that lives above the page tree, so a
// scan started in one tool keeps running when the user navigates to another
// (client-side navigation unmounts the page, but this module persists). Finished
// results are mirrored to localStorage so they survive a full reload too; a job
// still "running" at reload is dropped (a dead fetch can't be resumed - we never
// fake a running state). React binds via useSyncExternalStore.

import {
  type Job, type JobStatus,
  upsertJob, patchJob, latestForTool as latestForToolPure, runningCount as runningCountPure, persistable, pruneJobs,
} from "./model";

export type { Job, JobStatus };

const KEY = "tl:jobs";
let jobs: Job[] = [];
const listeners = new Set<() => void>();
let hydrated = false;

function now(): number {
  return typeof performance !== "undefined" ? Date.now() : Date.now();
}
function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) jobs = pruneJobs(JSON.parse(raw));
  } catch { /* ignore */ }
}

function persist() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(persistable(jobs))); } catch { /* quota - best effort */ }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  hydrate();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getSnapshot(): Job[] {
  hydrate();
  return jobs;
}

/** Stable empty snapshot for SSR (useSyncExternalStore server value). */
export function getServerSnapshot(): Job[] {
  return [];
}

export function getJob(id: string | null | undefined): Job | undefined {
  if (!id) return undefined;
  return jobs.find((j) => j.id === id);
}
export function latestJobForTool(tool: string): Job | undefined {
  return latestForToolPure(jobs, tool);
}
export function runningCount(): number {
  return runningCountPure(jobs);
}

export function dismissJob(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}
export function clearFinished() {
  jobs = jobs.filter((j) => j.status === "running");
  emit();
}

/**
 * Start a background job. `run` is an async closure held BY THIS MODULE, so it
 * keeps executing across client-side navigation. On settle the job is updated
 * and subscribers re-render (including the global tray). Returns the job id.
 */
export function startJob(opts: {
  tool: string;
  label: string;
  href: string;
  input: string;
  run: () => Promise<any>;
}): string {
  hydrate();
  const id = genId();
  const job: Job = {
    id, tool: opts.tool, label: opts.label, href: opts.href, input: opts.input,
    status: "running", startedAt: now(),
  };
  jobs = upsertJob(jobs, job);
  emit();

  opts.run().then(
    (result) => { jobs = patchJob(jobs, id, { status: "done", result, finishedAt: now() }); emit(); },
    (err) => { jobs = patchJob(jobs, id, { status: "error", error: String(err?.message || err), finishedAt: now() }); emit(); },
  );
  return id;
}

/** Convenience for the common fetch→json→ok pattern. */
export function startFetchJob(opts: {
  tool: string; label: string; href: string; input: string;
  url: string; init?: RequestInit;
}): string {
  return startJob({
    tool: opts.tool, label: opts.label, href: opts.href, input: opts.input,
    run: async () => {
      const r = await fetch(opts.url, opts.init);
      const txt = await r.text();
      let data: any;
      try { data = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || `Request failed (${r.status})`); }
      if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
      return data;
    },
  });
}
