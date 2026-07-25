// Measured error rate (layer 06 · P2). A standing fixture suite of known-negative
// sets (entities certain to be unrelated — the HARD cases: shared mass hosting,
// registrar, CMS, country, news cycle) and known-positive sets. The method is run
// against them and publishes its measured false-positive rate. A change that
// pushes FPR above the ceiling fails the build. The known-negative set is the
// larger one: finding connections that exist is easy; the question is whether the
// method invents them where they do not.

import { synthesizeCase } from "../case/synthesize";
import type { StrengthEdge } from "../case/cluster";

export const VALIDATION_VERSION = "method-validation-v1";
export const FIXTURE_SUITE_VERSION = "fixtures-v1";
export const FPR_CEILING = 0.1;

export interface MethodFixture {
  id: string;
  kind: "negative" | "positive";
  entities: string[];
  edges: StrengthEdge[];
  note: string;
}

// KNOWN-NEGATIVE — unrelated entities that share only class characteristics. If
// the method clusters any of these, that is a false positive.
export const KNOWN_NEGATIVE: MethodFixture[] = [
  { id: "neg-masshost", kind: "negative", entities: ["a.com", "b.com"], edges: [{ a: "a.com", b: "b.com", strength: "Medium", characteristic: "class", evidenceId: "ip" }], note: "shared mass-hosting IP only" },
  { id: "neg-registrar", kind: "negative", entities: ["c.com", "d.com"], edges: [{ a: "c.com", b: "d.com", strength: "Medium", characteristic: "class", evidenceId: "registrar" }], note: "same registrar only" },
  { id: "neg-cms", kind: "negative", entities: ["e.com", "f.com"], edges: [{ a: "e.com", b: "f.com", strength: "Low", characteristic: "class", evidenceId: "cms" }], note: "same CMS only" },
  { id: "neg-country", kind: "negative", entities: ["g.com", "h.com"], edges: [{ a: "g.com", b: "h.com", strength: "Low", characteristic: "class", evidenceId: "hosting_country" }], note: "same hosting country only" },
  { id: "neg-asn", kind: "negative", entities: ["i.com", "j.com"], edges: [{ a: "i.com", b: "j.com", strength: "Medium", characteristic: "class", evidenceId: "asn" }], note: "same ASN only" },
  { id: "neg-ns", kind: "negative", entities: ["k.com", "l.com"], edges: [{ a: "k.com", b: "l.com", strength: "Medium", characteristic: "class", evidenceId: "ns_set" }], note: "same managed-DNS provider only" },
  { id: "neg-mx", kind: "negative", entities: ["m.com", "n.com"], edges: [{ a: "m.com", b: "n.com", strength: "Medium", characteristic: "class", evidenceId: "mx_host" }], note: "same mail provider only" },
  { id: "neg-mixed", kind: "negative", entities: ["o.com", "p.com"], edges: [{ a: "o.com", b: "p.com", strength: "Medium", characteristic: "class", evidenceId: "asn" }, { a: "o.com", b: "p.com", strength: "Low", characteristic: "class", evidenceId: "cms" }], note: "several class features, nothing individual" },
];

// KNOWN-POSITIVE — entities with a genuine individual characteristic in common.
export const KNOWN_POSITIVE: MethodFixture[] = [
  { id: "pos-ga", kind: "positive", entities: ["q.com", "r.com"], edges: [{ a: "q.com", b: "r.com", strength: "High", characteristic: "individual", evidenceId: "ga" }], note: "shared self-hosted analytics id" },
  { id: "pos-san", kind: "positive", entities: ["s.com", "t.com"], edges: [{ a: "s.com", b: "t.com", strength: "High", characteristic: "individual", evidenceId: "san" }], note: "shared non-wildcard certificate SAN" },
  { id: "pos-adsense", kind: "positive", entities: ["u.com", "v.com"], edges: [{ a: "u.com", b: "v.com", strength: "High", characteristic: "individual", evidenceId: "adsense" }], note: "shared publisher id" },
];

function clusters(f: MethodFixture): boolean {
  const cf = synthesizeCase({ entities: f.entities, boardEdges: f.edges, enteredCaseAt: "2026-01-01T00:00:00Z" });
  return cf.clusters.some((c) => c.members.length > 1);
}

export interface ValidationResult {
  version: string;
  fixtureSuiteVersion: string;
  falsePositiveRate: number;
  falseNegativeRate: number;
  negatives: number;
  positives: number;
  sampleSize: number;
  passed: boolean;
}

export function runValidationWith(negatives: MethodFixture[], positives: MethodFixture[]): ValidationResult {
  const fp = negatives.filter(clusters).length;      // negatives that wrongly clustered
  const fn = positives.filter((f) => !clusters(f)).length; // positives that failed to cluster
  const falsePositiveRate = negatives.length ? fp / negatives.length : 0;
  const falseNegativeRate = positives.length ? fn / positives.length : 0;
  return {
    version: VALIDATION_VERSION, fixtureSuiteVersion: FIXTURE_SUITE_VERSION,
    falsePositiveRate, falseNegativeRate,
    negatives: negatives.length, positives: positives.length, sampleSize: negatives.length + positives.length,
    passed: falsePositiveRate <= FPR_CEILING,
  };
}

export function runValidation(): ValidationResult {
  return runValidationWith(KNOWN_NEGATIVE, KNOWN_POSITIVE);
}
