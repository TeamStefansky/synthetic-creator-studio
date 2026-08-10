// Analysis of Competing Hypotheses (layer 03 · P5). ACH eliminates, it does not
// confirm: hypotheses are ranked by FEWEST inconsistencies, never most
// confirmations. The null and the deception hypothesis are always present and
// never scored more harshly. Deception may lead only with positive MOM-POP
// (deception.ts); otherwise it cannot outrank a simpler hypothesis. All scoring
// is computed in TypeScript, reproducible without the model.

import type { HypothesisKind } from "./types";
import type { DeceptionAssessment } from "./deception";

export const HYPOTHESES_VERSION = "case-hypotheses-v1";
export const ACH_TIE_THRESHOLD = 1; // top two within this many inconsistencies => undetermined

export type Cell = "consistent" | "inconsistent" | "neutral";

// The kind of a diagnostic item determines its row of cells deterministically.
export type AchItemKind = "individualizing" | "class" | "negative" | "convenient";

export interface AchItem {
  id: string;
  label: string;
  kind: AchItemKind;
  enteredCaseAt?: string;      // for the post-hypothesis-collection flag
}

// Cell table: how likely is this evidence if the hypothesis were true?
const CELLS: Record<AchItemKind, Record<HypothesisKind, Cell>> = {
  // an individualizing shared artifact (unique GA id, non-wildcard SAN)
  individualizing: { same_operator: "consistent", coincidence_null: "inconsistent", deception: "consistent" },
  // a class-only overlap (CDN, ASN, registrar) - discriminates nothing
  class:           { same_operator: "neutral", coincidence_null: "neutral", deception: "neutral" },
  // an adequate absence of a predicted individualizing artifact (negative evidence)
  negative:        { same_operator: "inconsistent", coincidence_null: "consistent", deception: "neutral" },
  // an artifact that arrived too conveniently / points too neatly
  convenient:      { same_operator: "neutral", coincidence_null: "neutral", deception: "consistent" },
};

const ALL_HYPOTHESES: { kind: HypothesisKind; label: string }[] = [
  { kind: "same_operator", label: "Same operator runs these (common operation)" },
  { kind: "coincidence_null", label: "Unrelated operators / commodity infrastructure / coincidence (null)" },
  { kind: "deception", label: "Artifacts were left to be found (deception / false flag)" },
];

export interface AchRow {
  kind: HypothesisKind;
  label: string;
  cells: Record<string, Cell>;   // by item id
  inconsistencies: number;
  consistencies: number;
}

export interface AchResult {
  version: string;
  items: (AchItem & { diagnostic: boolean; postHypothesis: boolean })[];
  rows: AchRow[];
  leading?: HypothesisKind;
  undetermined: boolean;
  deceptionCappedReason?: string;
  falsification: string[];
  note: string;
}

const FALSIFICATION: Record<HypothesisKind, string[]> = {
  same_operator: [
    "an adequate search finding the shared individualizing artifact is absent on one side",
    "the shared artifact turns out to be a class characteristic (measured common base rate)",
    "independent registrant/operator records that contradict common control",
  ],
  coincidence_null: [
    "a second independent individualizing artifact class shared across the same pair",
    "temporally consistent, directional propagation of identical content",
  ],
  deception: [
    "positive MOM and POP indicators (motive + prior practice) - currently absent",
    "chain-of-custody showing the convenient artifact was not plant-able",
  ],
};

export interface AchInput {
  items: AchItem[];
  deception: DeceptionAssessment;
  hypothesisFormedAt?: string; // evidence entering after this is post-hypothesis
}

export function runAch(input: AchInput): AchResult {
  const formed = input.hypothesisFormedAt ? Date.parse(input.hypothesisFormedAt) : NaN;

  // An item is diagnostic if its cells are not identical across hypotheses.
  const items = input.items.map((it) => {
    const row = CELLS[it.kind];
    const diagnostic = new Set(Object.values(row)).size > 1;
    const postHypothesis = !!it.enteredCaseAt && !isNaN(formed) && Date.parse(it.enteredCaseAt) > formed;
    return { ...it, diagnostic, postHypothesis };
  });

  const rows: AchRow[] = ALL_HYPOTHESES.map(({ kind, label }) => {
    const cells: Record<string, Cell> = {};
    let inc = 0, con = 0;
    for (const it of input.items) {
      const c = CELLS[it.kind][kind];
      cells[it.id] = c;
      if (c === "inconsistent") inc++;
      else if (c === "consistent") con++;
    }
    return { kind, label, cells, inconsistencies: inc, consistencies: con };
  });

  // Rank by fewest inconsistencies (ties broken by fewer consistencies -> less vague).
  const ranked = [...rows].sort((a, b) => a.inconsistencies - b.inconsistencies || a.consistencies - b.consistencies || a.kind.localeCompare(b.kind));

  // Deception gate: it may not lead without positive MOM-POP. If it tops the raw
  // ranking without them, remove it from contention (it cannot outrank a simpler
  // hypothesis) and note why.
  let deceptionCappedReason: string | undefined;
  let pool = ranked;
  if (ranked[0].kind === "deception" && !input.deception.positiveMomPop) {
    deceptionCappedReason = "deception has the fewest inconsistencies but lacks positive MOM-POP indicators, so it cannot outrank a simpler hypothesis";
    pool = ranked.filter((r) => r.kind !== "deception");
  }

  const leadingRow = pool[0];
  const second = pool[1];
  const undetermined = !!second && Math.abs(second.inconsistencies - leadingRow.inconsistencies) <= ACH_TIE_THRESHOLD;

  return {
    version: HYPOTHESES_VERSION,
    items,
    rows,
    leading: undetermined ? undefined : leadingRow.kind,
    undetermined,
    deceptionCappedReason,
    falsification: FALSIFICATION[leadingRow.kind],
    note: undetermined
      ? "Top hypotheses are within the tie threshold - verdict is undetermined."
      : `Leading (fewest inconsistencies): ${leadingRow.label}.`,
  };
}
