// Casebook - a case is a named workspace (like a Chrome profile) that collects
// the searches you run under it. Switch the active case and every new search is
// linked to it; open a case to see all its searches and generate one dossier
// from everything the system actually collected.
//
// This is the LIGHTWEIGHT workspace layer. It is deliberately separate from the
// heavy forensic engine in lib/case/* (the Investigator/Case Synthesis), whose
// invariants it never touches. A Casebook holds references to CheckRecords; the
// dossier is assembled from those, read-only.

export const CASEBOOK_VERSION = "casebook-v1";

/** A case profile. `checkIds` reference CheckRecord ids in check history. */
export interface Casebook {
  id: string;
  name: string;
  /** Free-text description of what/who the case is about (never inferred). */
  subject?: string;
  /** Accent color for the profile chip. */
  color?: string;
  createdAt: string;
  updatedAt: string;
  checkIds: string[];
}

/** Palette for profile chips (Chrome-profile feel). */
export const CASE_COLORS = [
  "#6E8BFF", "#A98BF0", "#4FD1C5", "#F6A94A", "#F26D6D", "#57C77E", "#E86AA8", "#8FB0FF",
] as const;
