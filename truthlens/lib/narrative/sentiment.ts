// Deterministic lexicon sentiment. Versioned so historical scores stay
// interpretable (reproducibility rule). No network, no cost, no LLM variance.

// Version of the sentiment LEXICON itself (shown next to the sentiment signal).
export const SENTIMENT_LEXICON_VERSION = "sentiment-lexicon-v1";

// Version of the overall TruthLens threat-scoring RUBRIC, stamped on every report.
// Bumped once in P4: foreign-influence v2 plus the documented-campaign / foreign-
// agent indicators now carry scoring weight, so v2 scores are NOT comparable to v1.
export const RUBRIC_VERSION = "truthlens-threat-rubric-v2";

const POS = new Set(
  "good great positive win success confirm official effective safe true support help improve trust reliable praise".split(" ")
);
const NEG = new Set(
  ("bad terrible destroy fake lie hoax scam danger threat crisis fear corrupt fraud attack collapse " +
   "boycott toxic lawsuit scandal leak breach dangerous fail failure exposed accused shame outrage").split(" ")
);

const WORD = /[a-z0-9']+/g;

/** Returns sentiment in [-1, 1]; 0 when no lexicon hits (neutral / unknown tone). */
export function sentimentScore(text: string): number {
  const words = (text.toLowerCase().match(WORD) || []);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POS.has(w)) pos++;
    else if (NEG.has(w)) neg++;
  }
  if (pos === 0 && neg === 0) return 0;
  return Math.round(((pos - neg) / (pos + neg)) * 1000) / 1000;
}
