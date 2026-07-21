// The ONE source of truth for the LLM model id (CLAUDE.md: no model literal
// anywhere else in the repo). Override per-environment with ANTHROPIC_MODEL —
// e.g. drop to a cheaper model id in staging without touching code.

export const LLM_MODEL = process.env.ANTHROPIC_MODEL || "claude-fable-5";
