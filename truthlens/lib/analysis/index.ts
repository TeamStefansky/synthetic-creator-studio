// lib/analysis/ - the quantitative-analysis layer (the "brain").
//
// Four pure, deterministic, textbook-validated method modules that make every
// quantity carry its uncertainty (fabricated precision is a bug):
//   - stats:    inference, intervals, count-spike tail tests, FDR correction
//   - graph:    community detection (+Q), exact centrality, null-model co-occurrence
//   - dynamics: growth fit, Hawkes branching ratio, burstiness, change-point
//   - evidence: Bayesian combination, calibrated bands, dependence, sensitivity
//
// Integration (P5) routes the existing scorers through these while preserving their
// public output contracts, enriching each with an estimate + uncertainty + a
// method note. The math yields confidence on coordination/authenticity only - never
// a posterior identifying a person or state (frozen rules).

export * from "./stats";
export * from "./graph";
export * from "./dynamics";
export * from "./evidence";
export * from "./conformal";

import { STATS_VERSION } from "./stats";
import { GRAPH_VERSION } from "./graph";
import { DYNAMICS_VERSION } from "./dynamics";
import { EVIDENCE_VERSION } from "./evidence";
import { CONFORMAL_VERSION } from "./conformal";

/** One place listing every method-module version, for the report's analysis appendix. */
export const ANALYSIS_VERSIONS = {
  stats: STATS_VERSION,
  graph: GRAPH_VERSION,
  dynamics: DYNAMICS_VERSION,
  evidence: EVIDENCE_VERSION,
  conformal: CONFORMAL_VERSION,
} as const;
