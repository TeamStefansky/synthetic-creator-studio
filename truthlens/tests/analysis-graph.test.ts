import { describe, it, expect } from "vitest";
import {
  louvain,
  modularity,
  betweenness,
  pagerank,
  hypergeomTail,
  coOccurrenceEdges,
  pearson,
  temporalSynchrony,
  MODULARITY_FLOOR,
  type Graph,
} from "@/lib/analysis/graph";

// Two triangles joined by a single bridge edge — a clean planted 2-community graph.
const plantedTwo: Graph = {
  nodes: ["0", "1", "2", "3", "4", "5"],
  edges: [
    { a: "0", b: "1" }, { a: "1", b: "2" }, { a: "0", b: "2" },
    { a: "3", b: "4" }, { a: "4", b: "5" }, { a: "3", b: "5" },
    { a: "2", b: "3" }, // bridge
  ],
};

describe("louvain + modularity", () => {
  it("recovers the two planted communities with Q above the floor", () => {
    const p = louvain(plantedTwo);
    expect(p.communityCount).toBe(2);
    expect(p.modularity).toBeGreaterThan(MODULARITY_FLOOR);
    expect(p.established).toBe(true);
    // 0,1,2 together; 3,4,5 together
    expect(p.community["0"]).toBe(p.community["1"]);
    expect(p.community["1"]).toBe(p.community["2"]);
    expect(p.community["3"]).toBe(p.community["4"]);
    expect(p.community["2"]).not.toBe(p.community["3"]);
  });

  it("flags a structureless graph (K4) as not established (low Q)", () => {
    const k4: Graph = {
      nodes: ["a", "b", "c", "d"],
      edges: [
        { a: "a", b: "b" }, { a: "a", b: "c" }, { a: "a", b: "d" },
        { a: "b", b: "c" }, { a: "b", b: "d" }, { a: "c", b: "d" },
      ],
    };
    const p = louvain(k4);
    expect(p.modularity).toBeLessThan(MODULARITY_FLOOR);
    expect(p.established).toBe(false);
  });

  it("modularity of the correct planted split is positive", () => {
    const q = modularity(plantedTwo, { "0": 0, "1": 0, "2": 0, "3": 1, "4": 1, "5": 1 });
    expect(q).toBeGreaterThan(0.3);
  });

  it("is deterministic across runs (rule 8)", () => {
    expect(louvain(plantedTwo)).toEqual(louvain(plantedTwo));
  });
});

describe("betweenness (Brandes) identifies the bridge", () => {
  it("the middle of a path has the highest betweenness", () => {
    const path: Graph = {
      nodes: ["0", "1", "2", "3", "4"],
      edges: [{ a: "0", b: "1" }, { a: "1", b: "2" }, { a: "2", b: "3" }, { a: "3", b: "4" }],
    };
    const bt = betweenness(path);
    expect(bt["2"]).toBeGreaterThan(bt["1"]);
    expect(bt["1"]).toBeGreaterThan(bt["0"]);
    expect(bt["2"]).toBeCloseTo(4, 5); // exact betweenness of the middle of P5
  });
});

describe("pagerank", () => {
  it("the hub of a star ranks highest and the vector sums to ~1", () => {
    const star: Graph = {
      nodes: ["hub", "a", "b", "c"],
      edges: [{ a: "hub", b: "a" }, { a: "hub", b: "b" }, { a: "hub", b: "c" }],
    };
    const pr = pagerank(star);
    expect(pr["hub"]).toBeGreaterThan(pr["a"]);
    const sum = Object.values(pr).reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(1, 3);
  });
});

describe("hypergeometric co-occurrence null", () => {
  it("P(overlap≥2 | a=2,b=2,N=10) ≈ 0.0222", () => {
    expect(hypergeomTail(2, 2, 2, 10)).toBeCloseTo(1 / 45, 4);
  });
  it("overlap of 0 is never surprising (p=1)", () => {
    expect(hypergeomTail(0, 3, 3, 100)).toBe(1);
  });
  it("asserts an edge only when co-occurrence beats chance", () => {
    const edges = coOccurrenceEdges(
      {
        acc1: ["n1", "n2", "n3", "n4"],
        acc2: ["n1", "n2", "n3", "n4"], // heavy shared -> significant
        acc3: ["n1", "z1", "z2", "z3", "z4", "z5"], // shares only 1 common item
      },
      0.05,
    );
    const strong = edges.find((e) => (e.a === "acc1" && e.b === "acc2") || (e.a === "acc2" && e.b === "acc1"));
    expect(strong?.significant).toBe(true);
    const weak = edges.find((e) => e.a.includes("acc3") || e.b.includes("acc3"));
    // a single shared item over a large universe is not significant
    if (weak) expect(weak.significant).toBe(false);
  });
});

describe("temporal synchrony vs permutation null", () => {
  it("identical APERIODIC activity series correlate at 1 and register as significant", () => {
    // aperiodic on purpose: a periodic series is matched by its own shifts, so its
    // synchrony is correctly NOT significant — the null model catches that.
    const a = [0, 0, 1, 3, 9, 2, 0, 0, 1, 0, 0, 5];
    const r = temporalSynchrony(a, [...a], 42, 300);
    expect(r.correlation).toBeCloseTo(1, 6);
    expect(r.pValue).toBeLessThan(0.05);
  });
  it("pearson of anti-correlated series is negative", () => {
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });
  it("a too-short series is not significant", () => {
    const r = temporalSynchrony([1, 2], [1, 2]);
    expect(r.pValue).toBe(1);
  });
});
