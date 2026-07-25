// The journal (layer 05 · P3). Append-only reasoning trace: every plan, task
// chosen/skipped with diagnosticity + reason, hypothesis formed and when, each
// collection result, each integration, the adversarial pass, every stopping-rule
// evaluation, every authority rejection. It is the audit trail for the REASONING,
// complementing the chain of custody for the evidence, and makes the v2
// post-hypothesis flag exactly computable (it knows when each hypothesis formed).
// Subject to the same content rules as the report: no person names, no free-text
// speculation outside labeled statements.

import { namesPerson } from "../case/lexicon";

export const JOURNAL_VERSION = "agent-journal-v1";

export type JournalEntryType =
  | "hypotheses_formed" | "plan" | "task_chosen" | "task_skipped" | "collection"
  | "integration" | "adversarial" | "stop_eval" | "authority_rejection" | "note";

export interface JournalEntry {
  seq: number;
  at: string;
  cycle: number;
  type: JournalEntryType;
  detail: string;
  diagnosticity?: number;
}

export interface Journal {
  runId: string;
  version: string;
  entries: JournalEntry[];
}

export function newJournal(runId: string): Journal {
  return { runId, version: JOURNAL_VERSION, entries: [] };
}

/** Append an entry. Rejects person names to keep the journal auditable + clean. */
export function appendJournal(j: Journal, at: string, cycle: number, type: JournalEntryType, detail: string, diagnosticity?: number): Journal {
  if (namesPerson(detail)) {
    // Never record a person name; substitute a redaction marker (still audited).
    detail = "[redacted: person-name-like token removed per content rules]";
  }
  const seq = j.entries.length;
  return { ...j, entries: [...j.entries, { seq, at, cycle, type, detail, diagnosticity }] };
}
