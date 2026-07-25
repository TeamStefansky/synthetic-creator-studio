import { describe, it, expect } from "vitest";
import { synthesizeCase } from "../../lib/case/synthesize";
import { diffCases } from "../../lib/case/diff";
import type { StrengthEdge } from "../../lib/case/cluster";
import { ALL_FIXTURES } from "./fixtures/tool-outputs";

describe("case synthesis — integration (P7)", () => {
  it("headline calibration: only the GA pair clusters; mass-host pair and loner do not", () => {
    const entities = ["a.com", "b.com", "c.com", "d.com", "e.com"];
    const boardEdges: StrengthEdge[] = [
      { a: "a.com", b: "b.com", strength: "High", evidenceId: "ga", reason: "shared self-hosted GA id" },
      { a: "c.com", b: "d.com", strength: "Low", evidenceId: "ip", reason: "shared mass-host IP" },
      { a: "c.com", b: "d.com", strength: "Low", evidenceId: "reg", reason: "shared registrar" },
    ];
    const cf = synthesizeCase({ entities, boardEdges, enteredCaseAt: "2026-07-20T00:00:00Z" });
    const linked = cf.clusters.filter((c) => c.members.length > 1);
    expect(linked).toHaveLength(1);                       // exactly one real cluster
    expect(linked[0].members.sort()).toEqual(["a.com", "b.com"]);
    expect(linked[0].confidence).toBe("High");
    expect(cf.bottomLine.rung).toBe("association");        // one class of artifact => association, not common-operation
    // c.com, d.com, e.com are all singletons (weak edges never cluster)
    expect(cf.clusters.filter((c) => c.members.length === 1).map((c) => c.members[0]).sort()).toEqual(["c.com", "d.com", "e.com"]);
  });

  it("composes a ledger + timeline from real tool fixtures", () => {
    const cf = synthesizeCase({
      entities: ["domain:techforpalestine.org", "domain:shovrimshtika.org"],
      toolOutputs: { site: [ALL_FIXTURES.site, ALL_FIXTURES.siteB] },
      enteredCaseAt: "2026-07-20T00:00:00Z",
    });
    expect(cf.ledger.items.length).toBeGreaterThan(0);
    // the 1984 operator surfaces as evidence in both sites
    expect(cf.ledger.items.some((i) => i.kind === "net_org" && i.value === "1984")).toBe(true);
    // gaps register is populated and separate
    expect(cf.gaps.length).toBeGreaterThan(0);
  });

  it("no links => a valid 'no case' bottom line, not a fabricated one", () => {
    const cf = synthesizeCase({ entities: ["x.com", "y.com"], boardEdges: [{ a: "x.com", b: "y.com", strength: "Low" }], enteredCaseAt: "2026-07-20T00:00:00Z" });
    expect(cf.clusters.filter((c) => c.members.length > 1)).toHaveLength(0);
    expect(cf.bottomLine.likelihood).toBe("n/a");
    expect(cf.bottomLine.summary).toMatch(/no connection|common-by-default/i);
  });

  it("determinism: same inputs + snapshot => identical case", () => {
    const inputs = { entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" as const }], enteredCaseAt: "2026-07-20T00:00:00Z" };
    expect(JSON.stringify(synthesizeCase(inputs))).toBe(JSON.stringify(synthesizeCase(inputs)));
  });

  it("diff: adding a Strong link yields one new-cluster alert; drops never alert", () => {
    const base = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [], enteredCaseAt: "2026-07-20T00:00:00Z" });
    const next = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-07-20T00:00:00Z" });
    const d = diffCases(base, next);
    expect(d.newClusters.length).toBe(1);
    expect(d.alerts.length).toBe(1);
    // reverse direction: a link disappearing is context, never a regression alert
    const d2 = diffCases(next, base);
    expect(d2.alerts).toHaveLength(0);
  });
});
