import { describe, it, expect } from "vitest";
import { decayTransition, regressionsFromLost, strengthPreserved, driftAlert, type Reverification } from "../../lib/case/decay";
import type { Cluster } from "../../lib/case/cluster";
import type { EvidenceItem } from "../../lib/case/types";

const item = (id: string, contentHash: string, value = "G-ABC"): EvidenceItem => ({
  id, entityKey: "domain:a.com", kind: "ga_id", value, normalizedValue: value.toLowerCase(),
  enteredCaseAt: "2026-01-01T00:00:00Z", state: "live",
  provenances: [{ contentHash, acquisitionMethod: "fetch", collector: "site", collectorVersion: "1", collectedAt: "2026-01-01T00:00:00Z", lineageId: "l", sourceGrade: "B", infoCredibility: 2, gradeJustification: "x" }],
});

describe("evidence decay state machine (04·P4)", () => {
  it("404 WITH an archive => archived-only, strength unchanged, no alert", () => {
    const t = decayTransition(item("e1", "h1"), { status: "gone", archiveUrl: "https://web.archive.org/x", at: "2026-03-01T00:00:00Z" });
    expect(t.to).toBe("archived-only");
    expect(strengthPreserved(t.to, true)).toBe(true);
  });

  it("404 WITHOUT an archive => lost (not deleted), strength gone", () => {
    const t = decayTransition(item("e1", "h1"), { status: "gone", at: "2026-03-01T00:00:00Z" });
    expect(t.to).toBe("lost");
    expect(strengthPreserved(t.to, false)).toBe(false);
  });

  it("a lost sole-supporting artifact downgrades its cluster and emits ONE regression alert", () => {
    const cluster: Cluster = {
      id: 0, members: ["a.com", "b.com"], confidence: "High",
      bridgingEdges: [{ a: "a.com", b: "b.com", strength: "High", evidenceId: "e1" }],
      weakEdgesInside: [], articulationEdges: [],
    };
    const regs = regressionsFromLost([cluster], new Set(["e1"]));
    expect(regs).toHaveLength(1);
    expect(regs[0].alert).toMatch(/Regression/);
    // a cluster with a surviving bridge is NOT a regression
    const cluster2: Cluster = { ...cluster, bridgingEdges: [{ a: "a.com", b: "b.com", strength: "High", evidenceId: "e1" }, { a: "a.com", b: "b.com", strength: "High", evidenceId: "e2" }] };
    expect(regressionsFromLost([cluster2], new Set(["e1"]))).toHaveLength(0);
  });

  it("SILENT DRIFT: 200 with a changed hash supersedes the original (both kept) and names dependents", () => {
    const rv: Reverification = { status: "ok", currentContentHash: "h2-different", at: "2026-03-01T00:00:00Z" };
    const t = decayTransition(item("e1", "h1"), rv);
    expect(t.drift).toBe(true);
    expect(t.to).toBe("superseded");                 // original preserved, marked
    expect(t.superseding).toBeTruthy();
    expect(t.superseding!.supersedes).toBe("e1");     // new record points back
    expect(t.superseding!.id).not.toBe("e1");         // distinct id, both kept
    expect(t.superseding!.provenances[0].contentHash).toBe("h2-different");
    expect(driftAlert(item("e1", "h1"), ["cluster a.com,b.com"])).toMatch(/Silent content drift/);
  });

  it("200 with the SAME hash is a no-op (no false drift)", () => {
    const t = decayTransition(item("e1", "h1"), { status: "ok", currentContentHash: "h1", at: "2026-03-01T00:00:00Z" });
    expect(t.to).toBe("live");
    expect(t.drift).toBeUndefined();
  });
});
