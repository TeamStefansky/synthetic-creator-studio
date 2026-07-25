// Banned origin vocabulary (layer 03 · P2). "origin", "source of", "first",
// "patient zero" are claims about the world; we only ever have claims about our
// collection. Enforced by a lint test over generated output. The one correct
// phrasing is EARLIEST_OBSERVED_LABEL.

export const EARLIEST_OBSERVED_LABEL = "earliest observed in collected data";

// Word-boundary matches so "first" is caught but "firstName" / "at first glance"
// inside quoted evidence is the caller's concern (we lint generated labels).
export const ORIGIN_BANNED = /\b(origin|originated|source of|patient zero|first (?:seen|appeared|posted|published|to)|first\b)/i;

export function containsBannedOriginTerm(text: string): boolean {
  return ORIGIN_BANNED.test(text || "");
}

/** Rewrites the common offenders to the collection-scoped phrasing. */
export function toEarliestObserved(text: string): string {
  return (text || "").replace(/\borigin(ated)?\b/gi, EARLIEST_OBSERVED_LABEL).replace(/\bpatient zero\b/gi, EARLIEST_OBSERVED_LABEL);
}
