// Board edges → the case layer's StrengthEdge shape. Shared by Case Synthesis
// (/api/case) and The Investigator (/api/agent/run) - one mapping, so both see
// the same evidence and the same class-vs-individual characteristic split.

import type { BoardResult } from "./types";
import type { StrengthEdge } from "@/lib/case/cluster";
import { isIndividualCharacteristic } from "./calibrate";

export function boardStrengthEdges(board: BoardResult): StrengthEdge[] {
  return board.edges
    .filter((e) => e.strength !== "Unknown")
    .map((e) => ({
      a: e.a, b: e.b, strength: e.strength, evidenceId: `${e.a}:${e.b}`, reason: e.top?.display,
      characteristic: e.top ? (isIndividualCharacteristic(e.top.kind) ? "individual" as const : "class" as const) : undefined,
    }));
}
