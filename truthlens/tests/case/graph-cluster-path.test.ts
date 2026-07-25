import { describe, it, expect } from "vitest";
import { connectedComponents, bridges, topoOrder } from "../../lib/case/graph";
import { buildClusters, type StrengthEdge } from "../../lib/case/cluster";
import { buildPath, type PathInstance } from "../../lib/case/path";
import { eventTime } from "../../lib/case/adapters/util";

describe("graph algorithms (P3)", () => {
  it("connected components include isolated singletons", () => {
    const comps = connectedComponents(["a", "b", "c", "d"], [{ a: "a", b: "b" }]);
    expect(comps.map((c) => c.join(""))).toEqual(["ab", "c", "d"]);
  });
  it("bridges: a chain's edges are all bridges; a triangle has none", () => {
    expect(bridges(["a", "b", "c"], [{ a: "a", b: "b" }, { a: "b", b: "c" }])).toHaveLength(2);
    expect(bridges(["a", "b", "c"], [{ a: "a", b: "b" }, { a: "b", b: "c" }, { a: "c", b: "a" }])).toHaveLength(0);
  });
  it("topological order returns null on a cycle", () => {
    expect(topoOrder(["a", "b"], [{ from: "a", to: "b" }])).toEqual(["a", "b"]);
    expect(topoOrder(["a", "b"], [{ from: "a", to: "b" }, { from: "b", to: "a" }])).toBeNull();
  });
});

describe("clusters — the anti-conspiracy-wall guards (P3)", () => {
  it("weak edges never join two components", () => {
    const edges: StrengthEdge[] = [
      { a: "A", b: "B", strength: "Medium" }, // forms {A,B}
      { a: "C", b: "D", strength: "Medium" }, // forms {C,D}
      { a: "B", b: "C", strength: "Low" },    // must NOT merge the two
    ];
    const clusters = buildClusters(["A", "B", "C", "D"], edges);
    const abc = clusters.find((c) => c.members.includes("A"))!;
    expect(abc.members.sort()).toEqual(["A", "B"]);
    expect(abc.members).not.toContain("C");
    // the Low edge is displayed as weak-inside of neither cluster (endpoints split), so absent
    expect(abc.weakEdgesInside).toHaveLength(0);
  });

  it("cluster confidence is the weakest load-bearing link, not the strongest", () => {
    const edges: StrengthEdge[] = [
      { a: "A", b: "B", strength: "High", evidenceId: "ev-ga" },
      { a: "B", b: "C", strength: "Medium", evidenceId: "ev-ip" },
    ];
    const [cluster] = buildClusters(["A", "B", "C"], edges);
    expect(cluster.members.sort()).toEqual(["A", "B", "C"]);
    expect(cluster.confidence).toBe("Medium"); // weakest of High+Medium, never High
  });

  it("evidence-level sensitivity names the single most fragile load-bearing item", () => {
    const edges: StrengthEdge[] = [
      { a: "A", b: "B", strength: "High", evidenceId: "ev-strong" },
      { a: "B", b: "C", strength: "Medium", evidenceId: "ev-weak" },
    ];
    const [cluster] = buildClusters(["A", "B", "C"], edges);
    // both are bridges; the Medium one is the weakest -> "this conclusion depends on" it
    expect(cluster.dependsOn?.edge.evidenceId).toBe("ev-weak");
    expect(cluster.articulationEdges.length).toBe(2);
  });

  it("a single-entity component is valid and renders with Unknown confidence", () => {
    const [c] = buildClusters(["solo"], []);
    expect(c.members).toEqual(["solo"]);
    expect(c.confidence).toBe("Unknown");
  });
});

describe("propagation path — direction matrix + coverage cap (P3)", () => {
  const inst = (id: string, at: string | undefined, tier: any): PathInstance =>
    ({ id, claimId: "claim1", entity: id, time: eventTime(at, tier) });

  it("T1↔T1 far apart -> a directed edge from earlier to later", () => {
    const p = buildPath([inst("early", "2026-01-01T00:00:00Z", "T1"), inst("late", "2026-01-10T00:00:00Z", "T1")]);
    const directed = p.edges.filter((e) => e.kind === "directed");
    expect(directed).toHaveLength(1);
    expect(directed[0].from).toBe("early");
    expect(p.nodes.find((n) => n.id === "early")!.role).toBe("earliest_observed");
    expect(p.nodes.find((n) => n.id === "late")!.role).toBe("terminal");
  });

  it("T2↔T2 far apart -> ordered; T2↔T3 -> order not established; T4↔T4 -> order not established", () => {
    const t2 = buildPath([inst("a", "2026-01-01T00:00:00Z", "T2"), inst("b", "2026-02-01T00:00:00Z", "T2")]);
    expect(t2.edges[0].kind).toBe("directed");

    const t2t3 = buildPath([inst("a", "2026-01-01T00:00:00Z", "T2"), inst("b", "2026-02-01T00:00:00Z", "T3")]);
    expect(t2t3.edges[0].kind).toBe("order_not_established");

    const t4 = buildPath([inst("a", "2026-01-01T00:00:00Z", "T4"), inst("b", "2026-02-01T00:00:00Z", "T4")]);
    expect(t4.edges[0].kind).toBe("order_not_established");
  });

  it("an order-not-established pair is emitted, never silently dropped", () => {
    const p = buildPath([inst("a", "2026-01-01T00:00:00Z", "T3"), inst("b", "2026-02-01T00:00:00Z", "T3")]);
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0].kind).toBe("order_not_established");
  });

  it("path confidence is capped by coverage when an instance lacks a T2+ time", () => {
    const p = buildPath([
      inst("early", "2026-01-01T00:00:00Z", "T1"),
      inst("late", "2026-01-10T00:00:00Z", "T1"),
      inst("blind", "2026-01-05T00:00:00Z", "T4"), // observation-only -> caps coverage
    ]);
    expect(p.confidence).toBe("Medium");
    expect(p.coverageReason).toMatch(/no T2\+ time/);
  });
});
