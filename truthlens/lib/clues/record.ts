// Record a search into the cross-search clue index so links between DIFFERENT
// searches (shared IP / domain / analytics ID / ASN / SSL SAN) accumulate over
// time and can be drawn as a network. Browser-local (localStorage), best-effort.
// The full result blob is NOT stored (localStorage stays small) - only the
// extracted entities (via the clue index) plus a light history stub for labels.

import { genId, saveLocal, type CheckRecord } from "@/lib/check/history";
import { extractEntities } from "./extract";
import { linkAndRecord } from "./index";

export function recordSearch(type: string, input: string, headline: string, result: any, level?: string): void {
  if (typeof window === "undefined") return;
  const rec: CheckRecord = {
    id: genId(),
    type: type as CheckRecord["type"],
    input,
    headline: headline || input,
    level,
    createdAt: new Date().toISOString(),
    result, // full result so the search reopens with its data
  };
  // Save to history WITH the result; if localStorage is full, retry without the
  // (large) result blob so the history entry + entity links still persist.
  try { saveLocal(rec); }
  catch { try { saveLocal({ ...rec, result: undefined }); } catch { /* give up */ } }

  const entities = extractEntities(type, input, result);
  if (entities.length) { try { linkAndRecord(rec.id, entities); } catch { /* ignore */ } }
}
