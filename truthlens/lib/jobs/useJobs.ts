"use client";

// React bindings for the background-jobs singleton (useSyncExternalStore).

import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot, getServerSnapshot, getJob, latestJobForTool, type Job } from "./store";

/** All jobs, newest-first, re-rendering on any change. */
export function useJobs(): Job[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** A single job by id (or the latest job for a tool when no id is tracked yet). */
export function useJob(id: string | null, tool?: string): Job | undefined {
  const jobs = useJobs();
  void jobs; // ensure re-render on any change
  return getJob(id) || (tool ? latestJobForTool(tool) : undefined);
}
