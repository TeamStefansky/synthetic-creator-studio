// Collection doctrine (layer 06 · P3). The question decomposes into PIRs ->
// EEIs -> indicators -> tasks. A task that does not trace upward to a PIR is
// rejected by the planner (curiosity exhausts budgets). The collection matrix
// (PIR x EEI x source x status) is persisted and doubles as the gaps register:
// every unfilled cell is a KNOWN gap. Expected-diagnosticity ranking now operates
// WITHIN this structure — tasks ranked inside their EEI, EEIs inside their PIR.

export const COLLECTION_DOCTRINE_VERSION = "collection-doctrine-v1";

export interface PIR { id: string; question: string }
export interface EEI { id: string; pirId: string; fact: string }

export interface DoctrineTask {
  id: string;
  eeiId: string;          // must resolve to an EEI -> PIR, or the task is rejected
  source: string;
  description: string;
  diagnosticity: number;
}

export interface MatrixCell {
  pirId: string;
  eeiId: string;
  source: string;
  status: "filled" | "gap";
}

export interface CollectionPlan {
  accepted: (DoctrineTask & { pirId: string })[]; // ranked within EEI within PIR
  rejected: { task: DoctrineTask; reason: string }[];
  matrix: MatrixCell[];
  gaps: MatrixCell[];     // the unfilled cells — a known gap, not false confidence
}

export function buildCollectionPlan(pirs: PIR[], eeis: EEI[], tasks: DoctrineTask[]): CollectionPlan {
  const eeiById = new Map(eeis.map((e) => [e.id, e]));
  const pirById = new Map(pirs.map((p) => [p.id, p]));

  const accepted: (DoctrineTask & { pirId: string })[] = [];
  const rejected: { task: DoctrineTask; reason: string }[] = [];
  for (const t of tasks) {
    const eei = eeiById.get(t.eeiId);
    if (!eei || !pirById.has(eei.pirId)) {
      rejected.push({ task: t, reason: `task does not trace to a PIR (eei=${t.eeiId}) — rejected as untraceable curiosity` });
      continue;
    }
    accepted.push({ ...t, pirId: eei.pirId });
  }

  // Rank within EEI within PIR (diagnosticity descending).
  accepted.sort((a, b) => a.pirId.localeCompare(b.pirId) || a.eeiId.localeCompare(b.eeiId) || b.diagnosticity - a.diagnosticity || a.id.localeCompare(b.id));

  // Matrix: one cell per EEI × source; filled if an accepted task covers it, else a gap.
  const covered = new Set(accepted.map((t) => `${t.eeiId}␟${t.source}`));
  const matrix: MatrixCell[] = [];
  for (const e of eeis) {
    const sources = [...new Set([...tasks.filter((t) => t.eeiId === e.id).map((t) => t.source)])];
    if (sources.length === 0) { matrix.push({ pirId: e.pirId, eeiId: e.id, source: "(none planned)", status: "gap" }); continue; }
    for (const s of sources) matrix.push({ pirId: e.pirId, eeiId: e.id, source: s, status: covered.has(`${e.id}␟${s}`) ? "filled" : "gap" });
  }

  return { accepted, rejected, matrix, gaps: matrix.filter((c) => c.status === "gap") };
}
