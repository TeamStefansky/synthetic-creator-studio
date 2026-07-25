// Reconstruction + deterministic post-validator (layer 03 · P6). The LLM receives
// ONLY structured JSON (each item carrying its evidence id) and returns statements
// shaped { text, label, evidenceIds[], likelihood, confidence, rung }. Before any
// storage or display, the validator in code DROPS every statement that violates a
// rule, logs the reason, and surfaces the drop count — the filtering is never
// hidden. If more than half the statements are removed, no reconstruction is
// published: a shredded narrative is a signal, not something to paper over.
//
// The validator is pure and deterministic; the model only ever proposes prose.

import {
  CONFIDENCE_LEVELS, LIKELIHOOD_TERMS, exceedsRung, hasBannedPhrase, isConfidenceLevel,
  isLikelihoodTerm, namesPerson, type ConfidenceAxis, type Likelihood, type Rung,
} from "./lexicon";

export const NARRATIVE_PROMPT_VERSION = "case-narrative-v1";
export const SHRED_THRESHOLD = 0.5; // >50% dropped => publish no reconstruction

export type StatementLabel = "FACT" | "INFERENCE" | "ASSUMPTION" | "SPECULATION";

export interface RawStatement {
  text: string;
  label: StatementLabel;
  evidenceIds: string[];
  likelihood?: Likelihood | string;
  confidence?: ConfidenceAxis | string;
  rung: Rung;
  assertsOrdering?: { from: string; to: string };
  // Layer 06: a statement citing centrality must carry its collection boundary
  // (seed set + hop depth) — a sampled network's centrality is often an artifact
  // of the sampling.
  centralityBoundary?: string;
}

const CITES_CENTRALITY = /\b(central|centrality|broker|betweenness)\b/i;

export interface DropRecord { statement: RawStatement; reason: string }

export interface ValidationCtx {
  validEvidenceIds: Set<string>;      // every id in the ledger
  observedEvidenceIds: Set<string>;   // ids backed by directly-observed evidence (FACT-eligible)
  establishedOrderings: Set<string>;  // "from->to" pairs the path layer established
  deceptionComplete: boolean;         // an attribution-rung statement requires this
  allowedNameTokens?: Set<string>;    // infra tokens that look like names but aren't people
}

export interface ReconstructionResult {
  version: string;
  kept: RawStatement[];
  dropped: DropRecord[];
  total: number;
  shredRatio: number;
  suppressed: boolean;   // true => render "the evidence does not support a connected account"
  message: string;
}

/** The reason a statement is dropped, or null if it passes every rule. */
export function dropReason(s: RawStatement, ctx: ValidationCtx): string | null {
  if (!s.evidenceIds || s.evidenceIds.length === 0) return "no evidence id";
  for (const id of s.evidenceIds) if (!ctx.validEvidenceIds.has(id)) return `unknown evidence id: ${id}`;
  if (namesPerson(s.text, ctx.allowedNameTokens)) return "names a person / account holder";
  if (s.assertsOrdering && !ctx.establishedOrderings.has(`${s.assertsOrdering.from}->${s.assertsOrdering.to}`)) return "asserts an ordering the path layer did not establish";
  if (s.label === "FACT" && !s.evidenceIds.some((id) => ctx.observedEvidenceIds.has(id))) return "FACT label without a directly observed evidence item";
  if (exceedsRung(s.text, s.rung)) return `language exceeds recorded rung (${s.rung})`;
  if (s.rung === "attribution" && !ctx.deceptionComplete) return "attribution rung without a completed deception assessment";
  // Likelihood and confidence: both present or both absent, and each from its lexicon.
  const hasL = s.likelihood != null, hasC = s.confidence != null;
  if (hasL !== hasC) return "likelihood without confidence or vice versa";
  if (hasL && !isLikelihoodTerm(s.likelihood)) return `likelihood not in lexicon: ${s.likelihood}`;
  if (hasC && !isConfidenceLevel(s.confidence)) return `confidence not in {${CONFIDENCE_LEVELS.join(",")}}: ${s.confidence}`;
  if (hasBannedPhrase(s.text)) return "banned phrasing (vague authority / bare hedge as likelihood / % beside a lexicon term)";
  if (CITES_CENTRALITY.test(s.text) && !s.centralityBoundary) return "centrality claim without its collection boundary (seed + hop depth)";
  return null;
}

/** Deterministic post-validator. Drops offending statements, records each reason. */
export function validateStatements(statements: RawStatement[], ctx: ValidationCtx): ReconstructionResult {
  const kept: RawStatement[] = [];
  const dropped: DropRecord[] = [];
  for (const s of statements) {
    const reason = dropReason(s, ctx);
    if (reason) dropped.push({ statement: s, reason });
    else kept.push(s);
  }
  const total = statements.length;
  const shredRatio = total === 0 ? 0 : dropped.length / total;
  const suppressed = total > 0 && shredRatio > SHRED_THRESHOLD;
  return {
    version: NARRATIVE_PROMPT_VERSION,
    kept: suppressed ? [] : kept,
    dropped,
    total,
    shredRatio,
    suppressed,
    message: suppressed
      ? "the evidence does not support a connected account — showing the ledger and timeline only"
      : dropped.length
        ? `${dropped.length} of ${total} generated statements were removed for lacking evidence or exceeding their rung`
        : "all generated statements passed validation",
  };
}

/** The lexicon a caller must present to the model (documented, versioned). */
export const NARRATIVE_CONTRACT = {
  version: NARRATIVE_PROMPT_VERSION,
  labels: ["FACT", "INFERENCE", "ASSUMPTION", "SPECULATION"] as StatementLabel[],
  likelihood: LIKELIHOOD_TERMS,
  confidence: CONFIDENCE_LEVELS,
  instruction:
    "You receive ONLY structured JSON. Every statement must cite >=1 evidence id, carry a label, a " +
    "likelihood AND a confidence (or neither), and a rung. Never name a person. Never assert an " +
    "ordering not present in the path. Never use verbs of agency below the attribution rung.",
} as const;
