// Target & audience analysis (layer 06 · P6). Describes the OPERATION'S MODEL of
// an audience at community / segment level ONLY - language register, dialect,
// platform entry points, which grievance the content attaches to, timing relative
// to the target community's calendar. Mismatches are weighted highest (content
// that misreads its own audience indicates distance between operator and
// audience). HARD BOUNDARY: this must never represent an assessment of named
// individuals or a list of "susceptible" people - that is a targeting product and
// inverts the tool. The type carries no person field, and a guard enforces it.

import { namesPerson } from "./lexicon";

export const AUDIENCE_VERSION = "audience-v1";

export interface AudienceSignal {
  segment: string;      // a community / audience segment, never a person
  register: string;     // language register / dialect / framing observed
  mismatch: boolean;    // content misreads its audience (a distance tell)
  alternative: string;  // e.g. non-native contractor, translation tool, diaspora author
}

export interface AudienceAnalysis {
  signals: AudienceSignal[];
  mismatchesFirst: AudienceSignal[]; // mismatches weighted highest
}

export function analyzeAudience(signals: AudienceSignal[]): AudienceAnalysis {
  return { signals, mismatchesFirst: [...signals].sort((a, b) => Number(b.mismatch) - Number(a.mismatch)) };
}

/** Enforced boundary: audience analysis is segment-level; a named individual is forbidden. */
export function assertNoNamedIndividual(a: AudienceAnalysis): void {
  for (const s of a.signals) {
    if (namesPerson(s.segment) || namesPerson(s.register)) {
      throw new Error("audience analysis is community/segment-level only - a named individual is a targeting product and is forbidden");
    }
  }
}
