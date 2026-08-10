// Case brief export (layer 03 · P7). A plain-text/Markdown rendering of the case
// carrying its gaps register and falsification list (an export omitting them is a
// defect). Pure.

import type { CaseFile } from "./synthesize";
import type { EvidenceItem } from "./types";

// Inlined (client-safe) - avoids importing ledger.ts, which pulls in node:crypto.
const corroborationWeight = (i: EvidenceItem): number => new Set(i.provenances.map((p) => p.lineageId)).size;

export function caseBrief(cf: CaseFile): string {
  const L: string[] = [];
  L.push(`# TruthLens - case brief`);
  L.push("");
  L.push(`Decision-support, not a verdict. Nodes are infrastructure/accounts, never people. "Undetermined" and "no case" are valid results.`);
  L.push("");

  L.push(`## Bottom line`);
  L.push(`- ${cf.bottomLine.summary}`);
  L.push(`- Rung: **${cf.bottomLine.rung}** · Likelihood: **${cf.bottomLine.likelihood}** · Confidence: **${cf.bottomLine.confidence}** (stated separately)`);
  if (cf.ach.undetermined) L.push(`- ACH verdict: **undetermined** (top hypotheses within the tie threshold).`);
  else if (cf.ach.leading) L.push(`- Leading hypothesis: ${cf.ach.leading}.`);
  if (cf.ach.deceptionCappedReason) L.push(`- ${cf.ach.deceptionCappedReason}.`);
  L.push("");

  if (cf.assumptions.critical.length) {
    L.push(`## Load-bearing assumptions (most important findings)`);
    cf.assumptions.summaryLines.forEach((s) => L.push(`- ${s}`));
    L.push("");
  }

  const linked = cf.clusters.filter((c) => c.members.length > 1);
  L.push(`## Clusters`);
  if (!linked.length) L.push(`- none beyond common-by-default infrastructure.`);
  linked.forEach((c) => {
    L.push(`- **${c.members.join(", ")}** - ${c.confidence}${c.dependsOn ? ` · depends on: ${c.dependsOn.why}` : ""}`);
  });
  L.push("");

  L.push(`## Key evidence (top by corroboration)`);
  [...cf.ledger.items].sort((a, b) => corroborationWeight(b) - corroborationWeight(a)).slice(0, 12).forEach((i) => {
    const p = i.provenances[0];
    L.push(`- ${i.kind}: ${i.value} - ${p?.sourceGrade}${p?.infoCredibility} · ${i.eventTime ? `${i.eventTime.tier}` : "no time"} · corroboration ${corroborationWeight(i)}`);
  });
  L.push("");

  L.push(`## Competing hypotheses (ACH - fewest inconsistencies)`);
  cf.ach.rows.forEach((r) => L.push(`- ${r.label}: ${r.inconsistencies} inconsistencies`));
  L.push("");

  L.push(`## Negative evidence & gaps (kept separate)`);
  L.push(`- Gaps (${cf.gaps.length}) - zero evidential weight:`);
  cf.gaps.slice(0, 12).forEach((g) => L.push(`  - [${g.kind}] ${g.subject}: ${g.reason}`));
  L.push("");

  L.push(`## What would change this (falsification)`);
  cf.ach.falsification.forEach((f) => L.push(`- ${f}`));
  return L.join("\n");
}
