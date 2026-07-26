// The ONE source of truth for the LLM model id (CLAUDE.md: no model literal
// anywhere else in the repo). Override per-environment with ANTHROPIC_MODEL - // e.g. drop to a cheaper model id in staging without touching code.

// Default is the widely-available Claude Sonnet. Override per-environment with
// ANTHROPIC_MODEL (e.g. a newer/heavier model where the account has access).
export const LLM_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// Vision-heavy analysis (Post Check image forensics + public-figure recognition)
// benefits from the most capable model. Prefer VISION_MODEL; callers fall back to
// LLM_MODEL on a model-access error so the feature degrades gracefully instead of
// breaking when the account lacks access to the preferred model.
export const VISION_MODEL =
  process.env.ANTHROPIC_VISION_MODEL || process.env.ANTHROPIC_MODEL || "claude-fable-5";

/** True when an API error is about the model being unavailable to this account
 * (so a caller should retry with a fallback model, not surface a hard failure). */
export function isModelAccessError(message: string): boolean {
  return /not[_ ]?found|do(es)? not exist|no access|not have access|unavailable model|invalid model|permission|unauthorized model|model:.*(not|unknown)|404/i.test(message);
}
