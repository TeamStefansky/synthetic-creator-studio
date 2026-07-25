// Link Board -> EvidenceItem drafts (layer 03 · P1). Each calibrated pair edge
// becomes a structural board_edge record carrying its strength; the underlying
// shared artifacts arrive via the site adapter. Reproducible under the board
// rubric version stamped on the result.

import type { EvidenceDraft } from "../types";
import { draft, mkProvenance } from "./util";

export function boardToEvidence(board: any): EvidenceDraft[] {
  if (!board || !Array.isArray(board.edges)) return [];
  const at = board.generatedAt || new Date(0).toISOString();
  const rubric = board.rubricVersion || "board-overlap-v1";
  const out: EvidenceDraft[] = [];
  for (const e of board.edges) {
    if (!e?.a || !e?.b) continue;
    const ek = `domain:${String(e.a).toLowerCase()}`;
    const top = Array.isArray(e.items) && e.items[0] ? e.items[0].display : "";
    out.push(draft({
      entityKey: ek, kind: "board_edge",
      value: `${e.a}↔${e.b}:${e.strength}`,
      notes: [rubric, top].filter(Boolean).join(" · "),
      provenance: mkProvenance({ sourceClass: "board_calibrated", collectedAt: at, collector: "linkboard", collectorVersion: rubric, lineageId: `board:${e.a}:${e.b}` }),
    }));
  }
  return out;
}
