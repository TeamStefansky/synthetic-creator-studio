// Background-jobs model — pure, deterministic helpers for the client-side job
// store. Kept separate from the singleton so the reducer logic is unit-testable
// with no DOM. A "job" is a scan the user started that keeps running even after
// they navigate to another tool.

export type JobStatus = "running" | "done" | "error";

export interface Job {
  id: string;
  tool: string; // route key, e.g. "origin" | "radar" | "mentions"
  label: string; // human label incl. the input
  href: string; // where to view it, e.g. "/tools/origin"
  input: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  result?: any;
  error?: string;
}

/** Keep the list bounded and newest-first. Running jobs are always kept; only
 * finished (done/error) jobs are pruned beyond `maxFinished`. */
export function pruneJobs(list: Job[], maxFinished = 20): Job[] {
  const sorted = [...list].sort((a, b) => b.startedAt - a.startedAt);
  const finished = sorted.filter((j) => j.status !== "running");
  const running = sorted.filter((j) => j.status === "running");
  const keptFinished = finished.slice(0, maxFinished);
  return [...running, ...keptFinished].sort((a, b) => b.startedAt - a.startedAt);
}

/** Insert or replace a job by id, then prune. */
export function upsertJob(list: Job[], job: Job, maxFinished = 20): Job[] {
  return pruneJobs([job, ...list.filter((j) => j.id !== job.id)], maxFinished);
}

/** Apply a partial patch to a job by id (no-op if absent). */
export function patchJob(list: Job[], id: string, patch: Partial<Job>): Job[] {
  return list.map((j) => (j.id === id ? { ...j, ...patch } : j));
}

/** The most-recent job for a tool, if any. */
export function latestForTool(list: Job[], tool: string): Job | undefined {
  return [...list].filter((j) => j.tool === tool).sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** How many jobs are still running. */
export function runningCount(list: Job[]): number {
  return list.filter((j) => j.status === "running").length;
}

/** Only finished jobs are safe to persist across a full page reload — a running
 * fetch cannot survive one, so we never rehydrate a stale "running" (rule 7:
 * never fake capability). */
export function persistable(list: Job[]): Job[] {
  return list.filter((j) => j.status !== "running");
}
