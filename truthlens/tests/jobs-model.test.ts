// Background-jobs model. Gates: pruning keeps ALL running jobs but bounds
// finished ones; upsert replaces by id; patch is a no-op on a missing id;
// latestForTool picks the newest; only finished jobs are persistable (a dead
// running fetch is never rehydrated — rule 7).

import { describe, it, expect } from "vitest";
import {
  pruneJobs, upsertJob, patchJob, latestForTool, runningCount, persistable, type Job,
} from "@/lib/jobs/model";

const j = (id: string, over: Partial<Job> = {}): Job => ({
  id, tool: "origin", label: id, href: "/tools/origin", input: id,
  status: "done", startedAt: Number(id.replace(/\D/g, "")) || 1, ...over,
});

describe("pruneJobs", () => {
  it("keeps every running job but caps finished ones, newest-first", () => {
    const running = Array.from({ length: 5 }, (_, i) => j(`r${i + 1}`, { status: "running", startedAt: 100 + i }));
    const finished = Array.from({ length: 30 }, (_, i) => j(`f${i + 1}`, { status: "done", startedAt: i + 1 }));
    const out = pruneJobs([...finished, ...running], 20);
    expect(out.filter((x) => x.status === "running")).toHaveLength(5);
    expect(out.filter((x) => x.status !== "running")).toHaveLength(20);
    expect(out[0].startedAt).toBeGreaterThanOrEqual(out[1].startedAt); // sorted desc
  });
});

describe("upsertJob / patchJob", () => {
  it("replaces a job by id rather than duplicating", () => {
    const list = upsertJob([j("1")], j("1", { status: "error", startedAt: 1 }));
    expect(list.filter((x) => x.id === "1")).toHaveLength(1);
    expect(list[0].status).toBe("error");
  });
  it("patch updates by id and is a no-op on a missing id", () => {
    const list = [j("1", { startedAt: 1 })];
    expect(patchJob(list, "1", { status: "done" })[0].status).toBe("done");
    expect(patchJob(list, "nope", { status: "error" })).toEqual(list);
  });
});

describe("latestForTool / runningCount / persistable", () => {
  it("returns the newest job for a tool", () => {
    const list = [j("a1", { tool: "radar", startedAt: 1 }), j("a2", { tool: "radar", startedAt: 9 }), j("b", { tool: "origin", startedAt: 5 })];
    expect(latestForTool(list, "radar")!.id).toBe("a2");
    expect(latestForTool(list, "missing")).toBeUndefined();
  });
  it("counts running jobs and never persists a running one", () => {
    const list = [j("1", { status: "running", startedAt: 1 }), j("2", { status: "done", startedAt: 2 })];
    expect(runningCount(list)).toBe(1);
    expect(persistable(list).every((x) => x.status !== "running")).toBe(true);
    expect(persistable(list)).toHaveLength(1);
  });
});
