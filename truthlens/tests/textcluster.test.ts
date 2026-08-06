// Deterministic narrative clustering (TF-IDF + cosine). Gates: identical input
// → identical clusters (rule 8); no recurring structure → no forced clusters
// (rule 4); unicode scripts cluster (Hebrew must not be dropped); singletons
// stay out.

import { describe, it, expect } from "vitest";
import {
  tokenize,
  tfidfVectors,
  cosine,
  clusterTexts,
  topTerms,
  NARRATIVE_COSINE_THRESHOLD,
  MIN_CLUSTER_SIZE,
} from "../lib/narrative/textcluster";

describe("tokenize / tfidf", () => {
  it("tokenizes any script (Hebrew clusters, not dropped)", () => {
    expect(tokenize("עליית מחירים מכעיסה לקוחות")).toEqual(["עליית", "מחירים", "מכעיסה", "לקוחות"]);
  });
  it("vectors are L2-normalized (self-cosine = 1)", () => {
    const [v] = tfidfVectors(["alpha beta beta gamma"]);
    expect(cosine(v, v)).toBeCloseTo(1, 6);
  });
});

describe("clusterTexts", () => {
  const pricing = [
    "pricing increase angers subscribers with new fees",
    "subscribers protest the pricing increase and new monthly fees",
    "new fees and pricing increase draw subscriber backlash",
  ];
  const solar = [
    "solar charging station opens in Lisbon for drivers",
    "Lisbon drivers get a new solar charging station",
  ];

  it("groups the two storylines and keeps them apart", () => {
    const texts = [...pricing, ...solar];
    const clusters = clusterTexts(texts);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toEqual([0, 1, 2]); // largest first
    expect(clusters[1]).toEqual([3, 4]);
  });

  it("is deterministic: same input → same output, every run", () => {
    const texts = [...pricing, ...solar];
    const a = JSON.stringify(clusterTexts(texts));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(clusterTexts(texts))).toBe(a);
  });

  it("returns [] when nothing recurs (never force-fits unrelated posts)", () => {
    expect(
      clusterTexts([
        "quarterly earnings beat expectations",
        "hiking trails reopen after storm",
        "chess tournament finals announced",
      ]),
    ).toEqual([]);
  });

  it("singletons stay unclustered (MIN_CLUSTER_SIZE floor)", () => {
    const clusters = clusterTexts([...pricing, "totally unrelated meteor shower tonight"]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual([0, 1, 2]);
    expect(MIN_CLUSTER_SIZE).toBeGreaterThanOrEqual(2);
  });

  it("clusters Hebrew storylines", () => {
    const clusters = clusterTexts([
      "עליית המחירים מכעיסה את הלקוחות של החברה",
      "הלקוחות זועמים על עליית המחירים של החברה",
      "תחנת טעינה סולארית נפתחה בחיפה",
      "בחיפה נפתחה תחנת טעינה סולארית חדשה",
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("threshold is a named export in a sane range", () => {
    expect(NARRATIVE_COSINE_THRESHOLD).toBeGreaterThan(0.1);
    expect(NARRATIVE_COSINE_THRESHOLD).toBeLessThan(0.7);
  });
});

describe("topTerms", () => {
  it("surfaces the cluster's dominant terms for the mechanical label", () => {
    const texts = [
      "pricing increase angers subscribers",
      "subscribers protest pricing increase",
      "unrelated solar station news",
    ];
    const terms = topTerms(texts, [0, 1], 3);
    expect(terms).toContain("pricing");
    expect(terms).toContain("increase");
  });
});
