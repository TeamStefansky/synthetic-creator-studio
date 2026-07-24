// Record a search into the cross-search clue index so links between DIFFERENT
// searches (shared IP / domain / analytics ID / ASN / SSL SAN) accumulate over
// time and can be drawn as a network. Browser-local (localStorage), best-effort.
// The full result blob is NOT stored (localStorage stays small) - only the
// extracted entities (via the clue index) plus a light history stub for labels.

import { genId, saveLocal, type CheckRecord } from "@/lib/check/history";
import { extractEntities } from "./extract";
import { linkAndRecord } from "./index";

export function recordSearch(type: string, input: string, headline: string, result: any): void {
  if (typeof window === "undefined") return;
  const entities = extractEntities(type, input, result);
  if (!entities.length) return; // nothing linkable - don't clutter the index
  try {
    const rec: CheckRecord = {
      id: genId(),
      type: type as CheckRecord["type"],
      input,
      headline: headline || input,
      createdAt: new Date().toISOString(),
      // result intentionally omitted to keep localStorage small.
    };
    saveLocal(rec);
    linkAndRecord(rec.id, entities);
  } catch { /* best-effort; never break the tool */ }
}
