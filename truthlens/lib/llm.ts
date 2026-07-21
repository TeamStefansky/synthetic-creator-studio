// The ONE source of truth for the LLM model id (CLAUDE.md: no model literal
// anywhere else in the repo). Override per-environment with ANTHROPIC_MODEL —
// e.g. drop to a cheaper model id in staging without touching code.

// Default is the widely-available Claude Sonnet. Override per-environment with
// ANTHROPIC_MODEL (e.g. a newer/heavier model where the account has access).
export const LLM_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
