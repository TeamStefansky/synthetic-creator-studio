// Case synthesis orchestrator (layer 03 · P7). Composes every deterministic
// layer — ledger, timeline, clusters, path, ACH, gaps, assumptions — into one
// CaseFile. No model here: the reconstruction (narrate.ts) is applied separately
// and degrades to "not connected" without a key. Same inputs + versions =>
// identical CaseFile apart from the snapshot timestamp.

import { siteToEvidence, boardToEvidence, logsToEvidence, emailToEvidence, postToEvidence } from "./adapters";
import { buildLedger, corroborationWeight } from "./ledger";
import { buildTimeline, type Timeline } from "./timeline";
import { buildClusters, STRENGTH_RANK, type Cluster, type StrengthEdge } from "./cluster";
import { buildPath, type CasePath, type PathInstance } from "./path";
import { runAch, type AchItem, type AchResult } from "./hypotheses";
import { assessDeception, type DeceptionAssessment } from "./deception";
import { analyzeAssumptions, type Assumption, type AssumptionsResult } from "./assumptions";
import { buildGapsRegister, type Gap } from "./gaps";
import type { EvidenceOutcome } from "./negative";
import type { EvidenceDraft, HypothesisKind, Ledger } from "./types";
import type { ConfidenceLevel } from "@/components/ConfidenceBadge";
import type { Likelihood, Rung } from "./lexicon";

export const CASE_VERSION = "case-synthesis-v2";

export interface CaseInputs {
  entities: string[];
  toolOutputs?: { site?: any[]; board?: any; logs?: any[]; email?: any[]; post?: any[] };
  boardEdges?: StrengthEdge[];
  claimInstances?: PathInstance[];
  achItems?: AchItem[];
  deception?: DeceptionAssessment;
  assumptions?: Assumption[];
  outcomes?: EvidenceOutcome[];
  emptyAdapters?: string[];
  reverseIpUnavailable?: string[];
  hypothesisFormedAt?: string;
  enteredCaseAt?: string;
}

export interface BottomLine {
  leading?: HypothesisKind;
  undetermined: boolean;
  likelihood: Likelihood | "n/a";
  confidence: ConfidenceLevel;   // how much the sourcing/gap picture can bear
  rung: Rung;
  summary: string;
}

export interface CaseFile {
  version: string;
  entities: string[];
  ledger: Ledger;
  timeline: Timeline;
  clusters: Cluster[];
  path: CasePath;
  ach: AchResult;
  assumptions: AssumptionsResult;
  gaps: Gap[];
  bottomLine: BottomLine;
}

// Board edge strength -> ACH item kind (High/Medium distinctive => individualizing).
function achItemsFromEdges(edges: StrengthEdge[]): AchItem[] {
  return edges.map((e, i) => ({
    id: e.evidenceId || `edge:${e.a}:${e.b}:${i}`,
    label: `${e.a}↔${e.b} (${e.strength})`,
    kind: STRENGTH_RANK[e.strength] >= STRENGTH_RANK["Medium"] ? "individualizing" : "class",
  }));
}

function draftsFromTools(t: CaseInputs["toolOutputs"]): EvidenceDraft[] {
  if (!t) return [];
  const d: EvidenceDraft[] = [];
  for (const s of t.site || []) d.push(...siteToEvidence(s));
  if (t.board) d.push(...boardToEvidence(t.board));
  for (const l of t.logs || []) d.push(...logsToEvidence(l));
  for (const e of t.email || []) d.push(...emailToEvidence(e));
  for (const p of t.post || []) d.push(...postToEvidence(p));
  return d;
}

// Likelihood ladder keyed by the strongest cluster's confidence, and whether the
// case is undetermined. Deterministic; all mappings are explicit here.
const LIKELIHOOD_BY_CONFIDENCE: Record<ConfidenceLevel, Likelihood> = {
  High: "very likely", Medium: "likely", Low: "unlikely", Unknown: "unlikely",
};

function deriveBottomLine(clusters: Cluster[], ach: AchResult, ledger: Ledger, gaps: Gap[]): BottomLine {
  const linked = clusters.filter((c) => c.members.length > 1 && STRENGTH_RANK[c.confidence] >= STRENGTH_RANK["Medium"]);
  const strongest = linked.reduce<ConfidenceLevel>((m, c) => (STRENGTH_RANK[c.confidence] > STRENGTH_RANK[m] ? c.confidence : m), "Unknown");

  // Rung: association by default; common-operation requires at least one
  // INDIVIDUAL characteristic among a cluster's bridging edges (class features,
  // however many, never individualize). Never attribution from structure alone.
  const commonOp = linked.some((c) => c.bridgingEdges.some((e) => e.characteristic === "individual"));
  const rung: Rung = commonOp ? "common-operation" : "association";

  // Confidence: bounded by corroboration and the gaps picture (a separate axis).
  const avgCorro = ledger.items.length ? ledger.items.reduce((s, i) => s + corroborationWeight(i), 0) / ledger.items.length : 0;
  const manyGaps = gaps.length >= 6;
  let confidence: ConfidenceLevel;
  if (!linked.length) confidence = "Unknown";
  else if (avgCorro >= 2 && !manyGaps) confidence = "High";
  else if (avgCorro < 1.2 || manyGaps) confidence = "Low";
  else confidence = "Medium";

  const undetermined = ach.undetermined;
  const leading = ach.leading;
  const likelihood: Likelihood | "n/a" = !linked.length ? "n/a" : LIKELIHOOD_BY_CONFIDENCE[strongest];

  const summary = !linked.length
    ? "No connection is established beyond common-by-default infrastructure — a valid, common result."
    : undetermined
      ? "Competing explanations are within the tie threshold — undetermined. Showing evidence, not a verdict."
      : `${linked.length} cluster(s) at ${rung} rung; strongest link ${strongest}. Likelihood and confidence are stated separately.`;

  return { leading, undetermined, likelihood, confidence, rung, summary };
}

export function synthesizeCase(input: CaseInputs): CaseFile {
  const enteredCaseAt = input.enteredCaseAt || new Date().toISOString();
  const ledger = buildLedger(draftsFromTools(input.toolOutputs), enteredCaseAt);
  const timeline = buildTimeline(ledger);
  // Canonicalize edge order so conclusions are independent of collection order
  // (the agent's determinism guarantee: same final ledger => same case).
  const boardEdges = [...(input.boardEdges || [])].sort((a, b) =>
    (a.a + a.b + a.strength).localeCompare(b.a + b.b + b.strength));
  const clusters = buildClusters(input.entities, boardEdges);
  const path = buildPath(input.claimInstances || []);
  const deception = input.deception || assessDeception({});
  const achItems = input.achItems || achItemsFromEdges(boardEdges);
  const ach = runAch({ items: achItems, deception, hypothesisFormedAt: input.hypothesisFormedAt });
  const assumptions = analyzeAssumptions(input.assumptions || []);
  const gaps = buildGapsRegister({
    ledger, entities: input.entities, outcomes: input.outcomes,
    emptyAdapters: input.emptyAdapters, reverseIpUnavailable: input.reverseIpUnavailable,
  });
  const bottomLine = deriveBottomLine(clusters, ach, ledger, gaps);

  return { version: CASE_VERSION, entities: input.entities, ledger, timeline, clusters, path, ach, assumptions, gaps, bottomLine };
}
