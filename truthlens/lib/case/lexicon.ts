// Lexicon + rung ladder (layer 03 · P6). The load-bearing ethics control: language
// may never exceed its recorded rung, and drift up the ladder between the evidence
// section and the summary - the way a defensible report becomes an indefensible
// headline - must be impossible by construction. Pure + deterministic.

export const LEXICON_VERSION = "case-lexicon-v1";

export type Rung = "association" | "common-operation" | "attribution";
export const RUNG_RANK: Record<Rung, number> = { association: 1, "common-operation": 2, attribution: 3 };

// Verbs of agency - attribution rung ONLY, and attribution additionally requires a
// completed deception assessment (enforced in narrate.ts).
export const ATTRIBUTION_VERBS = /\b(coordinated|directed|funded|controlled|orchestrated|operated by|run by|managed by|backed by|sponsored by|state-sponsored)\b/i;
// Common-operation language: same hands, without naming who.
export const COMMON_OP_PHRASES = /\b(same (operator|party|group|hands|entity)|jointly (run|operated)|common control|under one operator)\b/i;
// Association rung - the only verbs permitted there.
export const ASSOCIATION_VERBS = /\b(shares?|is hosted alongside|hosted alongside|published identical content to|overlaps? with|is associated with)\b/i;

// The rung a statement's LANGUAGE implies (the highest it reaches).
export function rungOf(text: string): Rung {
  if (ATTRIBUTION_VERBS.test(text)) return "attribution";
  if (COMMON_OP_PHRASES.test(text)) return "common-operation";
  return "association";
}

export function exceedsRung(text: string, recorded: Rung): boolean {
  return RUNG_RANK[rungOf(text)] > RUNG_RANK[recorded];
}

// The standard likelihood lexicon - the only permitted likelihood terms.
export const LIKELIHOOD_TERMS = [
  "almost no chance", "very unlikely", "unlikely", "roughly even chance",
  "likely", "very likely", "almost certain",
] as const;
export type Likelihood = (typeof LIKELIHOOD_TERMS)[number];
export const CONFIDENCE_LEVELS = ["low", "moderate", "high"] as const;
export type ConfidenceAxis = (typeof CONFIDENCE_LEVELS)[number];

export function isLikelihoodTerm(x?: string): x is Likelihood {
  return !!x && (LIKELIHOOD_TERMS as readonly string[]).includes(x);
}
export function isConfidenceLevel(x?: string): x is ConfidenceAxis {
  return !!x && (CONFIDENCE_LEVELS as readonly string[]).includes(x);
}

// Banned regardless of rung: vague authority, bare hedges used AS a likelihood,
// and a percentage stated alongside a lexicon term (false precision).
export const BANNED_PHRASES = /\b(sources indicate|it is widely believed|reports suggest|rumou?red to)\b/i;
export const BARE_HEDGE_AS_LIKELIHOOD = /\b(possibly|may(?:be)?|could|cannot be ruled out|it is possible)\b/i;

export function hasBannedPhrase(text: string): boolean {
  if (BANNED_PHRASES.test(text)) return true;
  // percentage next to a lexicon term, e.g. "likely (70%)"
  for (const t of LIKELIHOOD_TERMS) if (text.toLowerCase().includes(t) && /\d{1,3}\s*%/.test(text)) return true;
  return false;
}

// Names a person / account holder. Conservative heuristic: a Firstname Lastname
// Latin sequence (or "@handle claimed to be <Name>") that is not one of the
// allowed infrastructure tokens. Nodes are infra; a personal name is out of bounds.
const PERSON_NAME = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/;
export function namesPerson(text: string, allowedTokens: Set<string> = new Set()): boolean {
  const m = text.match(PERSON_NAME);
  if (!m) return false;
  return !allowedTokens.has(m[0].toLowerCase());
}
