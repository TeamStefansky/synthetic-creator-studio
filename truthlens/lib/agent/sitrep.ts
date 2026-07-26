// The situation report (layer 05 · P5). Generated to an exact structure — every
// section required; an empty one renders "none established" rather than being
// omitted (a missing section reads as an absent problem). Deterministic: the
// reconstruction is built in code from the case as labeled, cited statements, so
// it works without the model; the LLM narrator (when a key is set) only enriches
// prose and passes the same validator. NOT PURSUED surfaces the agent's silent
// decisions — its most consequential ones.

import type { CaseFile } from "../case/synthesize";
import type { AdversaryResult } from "./adversary";
import type { RunRecord } from "./types";

export const SITREP_VERSION = "agent-sitrep-v1";

export interface NotPursued { task: string; diagnosticity: number; reason: string }
export interface PriorJudgment { rung: string; likelihood: string; confidence: string }

export interface SitrepInput {
  record: RunRecord;
  caseFile: CaseFile;
  adversary: AdversaryResult;
  notPursued: NotPursued[];
  previous?: PriorJudgment;
  // Layer 06 · P7 surfacing:
  measuredFpr?: number;
  fixtureSuiteVersion?: string;
  premortem?: string[];
  conceptionWarning?: string;
  // Auto-insights from the analyst's own searches + external operator enrichment.
  insights?: string[];
  operatorReputation?: import("@/lib/operator-reputation").OperatorReputation;
}

export interface Sitrep {
  version: string;
  sections: Record<string, string>;
  markdown: string;
}

const NONE = "none established";

export function buildSitrep(input: SitrepInput): Sitrep {
  const { record, caseFile: cf, adversary } = input;
  const linked = cf.clusters.filter((c) => c.members.length > 1);
  const S: Record<string, string> = {};

  S["STATUS"] = `${record.status} · coverage: ${record.coverage} · stop: ${record.stopCondition ?? NONE} · ceiling: ${record.ceiling}`;

  S["BOTTOM LINE"] = adversary.verdict === "undetermined"
    ? "Undetermined — the counter-case is not clearly weaker. Evidence shown, no verdict claimed."
    : cf.bottomLine.summary;

  S["JUDGMENT"] = `likelihood: ${cf.bottomLine.likelihood} · confidence: ${cf.bottomLine.confidence} · rung: ${cf.bottomLine.rung}` +
    (linked.some((c) => c.dependsOn) ? `\nLoad-bearing: ${linked.filter((c) => c.dependsOn).map((c) => c.dependsOn!.why).join("; ")}` : "");

  S["CHANGED SINCE LAST REPORT"] = input.previous
    ? [
        input.previous.rung !== cf.bottomLine.rung ? `rung ${input.previous.rung} → ${cf.bottomLine.rung}${input.previous.rung === "common-operation" && cf.bottomLine.rung === "association" ? " (RETRACTION)" : ""}` : "",
        input.previous.likelihood !== cf.bottomLine.likelihood ? `likelihood ${input.previous.likelihood} → ${cf.bottomLine.likelihood}` : "",
        input.previous.confidence !== cf.bottomLine.confidence ? `confidence ${input.previous.confidence} → ${cf.bottomLine.confidence}` : "",
      ].filter(Boolean).join("; ") || NONE
    : NONE;

  S["KEY EVIDENCE"] = cf.ledger.items.length
    ? cf.ledger.items.slice(0, 10).map((i) => `${i.kind}:${i.value} | ${i.provenances[0]?.sourceGrade ?? "F"}${i.provenances[0]?.infoCredibility ?? 6} | ${i.eventTime?.tier ?? "no-time"}`).join("\n")
    : NONE;

  // Deterministic, labeled, cited reconstruction (no model needed).
  const recon: string[] = [];
  for (const c of linked) recon.push(`INFERENCE: ${c.members.join(" shares infrastructure with ")} [${c.confidence}] (cite: ${c.bridgingEdges.map((e) => e.evidenceId).filter(Boolean).join(",") || "cluster"})`);
  for (const e of cf.path.edges) recon.push(e.kind === "directed" ? `INFERENCE: ${e.from} → ${e.to} (ordered)` : `FACT: ${e.from} and ${e.to} are related but order not established`);
  S["RECONSTRUCTION"] = recon.length ? recon.join("\n") : NONE;

  S["THE CASE AGAINST"] = adversary.reasons.length ? adversary.reasons.join("\n") : NONE;

  S["KEY ASSUMPTIONS"] = cf.assumptions.list.length
    ? [...cf.assumptions.critical, ...cf.assumptions.list.filter((a) => !cf.assumptions.critical.includes(a))].map((a) => `${a.text} [${a.confidence}${a.loadBearing ? ", load-bearing" : ""}]`).join("\n")
    : NONE;

  S["NEGATIVE EVIDENCE"] = NONE; // populated when predicted-artifact searches run under full coverage
  S["GAPS"] = cf.gaps.length ? cf.gaps.slice(0, 12).map((g) => `[${g.kind}] ${g.subject}: ${g.reason}`).join("\n") : NONE;

  S["WHAT WOULD CHANGE THIS"] = cf.ach.falsification.length ? cf.ach.falsification.map((f) => `- ${f}`).join("\n") : NONE;

  S["NOT PURSUED"] = input.notPursued.length
    ? input.notPursued.map((n) => `${n.task} [diag ${n.diagnosticity.toFixed(2)}] — ${n.reason}`).join("\n")
    : NONE;

  // Layer 06 · P7 — method reliability, premortem, and the conception watch.
  S["INSIGHTS FROM YOUR SEARCHES"] = input.insights?.length ? input.insights.map((i) => `- ${i}`).join("\n") : NONE;

  const rep = input.operatorReputation;
  S["EXTERNAL ENRICHMENT — OPERATOR"] = rep
    ? [
        `Operator(s): ${rep.operators.join(", ") || rep.asnOrg || "unknown"} · ${rep.coHostedCount} co-hosted domain(s) · sanctions: ${rep.sanctions.connected ? `${rep.sanctions.hits} hit(s)` : "not connected"}`,
        ...rep.flags.map((f) => `- [${f.kind.replace(/_/g, " ")} · ${f.confidence} · ${f.onOwnInfra ? "own infra" : "co-hosted"}] ${f.detail} (re: ${f.subject})${f.citation ? ` — ${f.citation}` : ""}. Could also be: ${f.alternative}`),
        ...(rep.publicOfficers?.officers.length
          ? ["Officers on public record (disclosed, cited — not attribution):", ...rep.publicOfficers.officers.map((o) => `- ${o.name}${o.role ? ` · ${o.role}` : ""} — ${o.sourceUrl || o.source}`)]
          : []),
        rep.flags.length ? "" : rep.note,
      ].filter(Boolean).join("\n")
    : NONE;

  S["METHOD RELIABILITY"] = input.measuredFpr != null
    ? `measured false-positive rate ${(input.measuredFpr * 100).toFixed(1)}% (fixture suite ${input.fixtureSuiteVersion ?? "n/a"})`
    : NONE;
  S["THE PREMORTEM"] = input.premortem?.length ? input.premortem.join("\n") : NONE;
  S["CONCEPTION WATCH"] = input.conceptionWarning || "no conception warning — the leading hypothesis is still accumulating contradictions normally";

  const order = ["STATUS", "BOTTOM LINE", "INSIGHTS FROM YOUR SEARCHES", "JUDGMENT", "CHANGED SINCE LAST REPORT", "KEY EVIDENCE", "EXTERNAL ENRICHMENT — OPERATOR", "RECONSTRUCTION", "THE CASE AGAINST", "KEY ASSUMPTIONS", "NEGATIVE EVIDENCE", "GAPS", "WHAT WOULD CHANGE THIS", "NOT PURSUED", "METHOD RELIABILITY", "THE PREMORTEM", "CONCEPTION WATCH"];
  const markdown = ["# THE INVESTIGATOR — situation report", "", "Decision-support, not a verdict. Nodes are infrastructure/accounts, never people.", "", ...order.map((k) => `## ${k}\n${S[k]}`)].join("\n");

  return { version: SITREP_VERSION, sections: S, markdown };
}
