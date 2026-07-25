// Premortem + structured self-critique (layer 06 · P6). Before any report: assume
// it is six months later and this judgment was proven badly wrong — explain how.
// Prospective hindsight surfaces failure paths that "what could go wrong?" misses,
// because it removes the need to defend the conclusion while critiquing it. Output
// is labeled statements, stored and rendered.

import type { CaseFile } from "../case/synthesize";

export const PREMORTEM_VERSION = "premortem-v1";

export interface LabeledStatement { label: "FACT" | "INFERENCE" | "ASSUMPTION" | "SPECULATION"; text: string }

export function buildPremortem(cf: CaseFile): { statements: LabeledStatement[] } {
  const s: LabeledStatement[] = [];
  s.push({ label: "SPECULATION", text: "Assume it is six months from now and this judgment was proven badly wrong. How did that happen?" });

  const linked = cf.clusters.filter((c) => c.members.length > 1);
  for (const c of linked) {
    if (c.dependsOn) s.push({ label: "INFERENCE", text: `It failed because the load-bearing link (${c.dependsOn.why}) was a shared-tooling / baseline artifact, not common operation.` });
  }
  if (cf.gaps.length) s.push({ label: "ASSUMPTION", text: `It failed because a gap we never closed (${cf.gaps[0].subject}) hid the disconfirming evidence.` });
  if (cf.assumptions.critical.length) s.push({ label: "ASSUMPTION", text: `It failed because the load-bearing low-confidence assumption "${cf.assumptions.critical[0].text}" was wrong.` });
  s.push({ label: "SPECULATION", text: "It failed because convenient evidence was staged and the deception hypothesis was under-weighted." });
  return { statements: s };
}

// Mechanical structured self-critique — each item resolved, not merely acknowledged.
export const SELF_CRITIQUE_ITEMS = ["sources", "assumptions", "diagnosticity", "alternatives", "deception", "gaps", "changed circumstances"] as const;
export type SelfCritiqueItem = (typeof SELF_CRITIQUE_ITEMS)[number];

export function structuredSelfCritique(resolved: Partial<Record<SelfCritiqueItem, boolean>>): { unresolved: SelfCritiqueItem[] } {
  return { unresolved: SELF_CRITIQUE_ITEMS.filter((i) => !resolved[i]) };
}
