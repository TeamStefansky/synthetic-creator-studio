// OSINT report compiler — fills the 14-section template (lib/osint/template.ts)
// and ENFORCES its compiler rules:
//   - the BLUF confidence and the Section-10 attribution confidence are ONE value
//     (drift is structurally impossible — both read `overall_confidence`), and it
//     must be a legal High/Moderate/Low;
//   - fact vs assessment stays visibly separate (a required note);
//   - a missing narrative section renders an honest "Not assessed" — never a
//     fabricated paragraph (rule 4);
//   - attribution is organization/campaign-level; the compiler rejects a report
//     whose assessed actor looks like a bare personal name (rule 1).
// Pure + deterministic; the LLM (if used upstream) only supplies narrative prose,
// never the scores or the confidence.

import { REPORT_TEMPLATE } from "./template";

export const REPORT_COMPILER_VERSION = "osint-report-v1";

export type Confidence = "High" | "Moderate" | "Low";
export const CONFIDENCE_VALUES: Confidence[] = ["High", "Moderate", "Low"];

export interface ReportInput {
  network_name: string;
  date: string;
  run_id: string;
  mode: string; // "full" | "brief"
  seed: string;
  overall_confidence: Confidence; // used in BOTH the BLUF and Section 10
  cluster: string;
  assessed_actor: string; // org/campaign, never a bare person name
  narratives_short?: string;
  audience_short?: string;
  breakout_category?: string;
  executive_summary?: string;
  scope?: string;
  kiq_list?: string;
  tools_live?: string;
  tools_not_configured?: string;
  collection_dates?: string;
  actor_narrative?: string;
  actor_table_rows?: string;
  asset_table_rows?: string;
  infrastructure_narrative?: string;
  infra_table_rows?: string;
  underground_findings_or_none?: string;
  narrative_analysis?: string;
  disarm_table_rows?: string;
  impact_evidence?: string;
  ach_table_rows?: string;
  playbook_comparison?: string;
  gaps?: string;
  next_steps?: string;
  sources_numbered_with_links?: string;
}

const NOT_ASSESSED = "_Not assessed — insufficient collection._";
const EMPTY_ROW = "| _no load-bearing rows_ | | | |";
const FACT_ASSESSMENT_NOTE =
  "Fact and assessment are kept visibly separate: tables and Section 5–6 are observed facts with sources; Sections 1, 4, 7, 9–11 are analytic assessments.";

/** True when `s` looks like a bare personal name (Firstname Lastname) rather than
 * an organization/campaign. Used to keep attribution org-level (rule 1). */
export function looksLikePersonName(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  // Org markers → not a bare person name.
  if (/\b(inc|ltd|llc|gmbh|co|corp|group|media|agency|network|campaign|operation|ministry|service|bureau|dept|department|aligned|state|gov|holdings?|ehf|ooo|ao)\b/i.test(t)) return false;
  if (/(unknown|undetermined|unattributed|n\/a)/i.test(t)) return false;
  // Two or three Capitalized words, nothing else → looks like a person.
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(t);
}

export interface ReportValidation {
  valid: boolean;
  violations: string[];
}

/** Enforce the template's compiler rules. Pure. */
export function validateReport(input: ReportInput): ReportValidation {
  const v: string[] = [];
  if (!input.network_name?.trim()) v.push("network_name is required.");
  if (!input.overall_confidence || !CONFIDENCE_VALUES.includes(input.overall_confidence)) {
    v.push("overall_confidence must be exactly one of High / Moderate / Low (used in both the BLUF and Section 10).");
  }
  if (!input.assessed_actor?.trim()) {
    v.push("assessed_actor is required (use 'Undetermined' when attribution is not established).");
  } else if (looksLikePersonName(input.assessed_actor)) {
    v.push("assessed_actor looks like a private individual's name — attribution must be organization/campaign-level (rule 1).");
  }
  return { valid: v.length === 0, violations: v };
}

function val(input: ReportInput, key: keyof ReportInput, fallback: string): string {
  const x = input[key];
  return x != null && String(x).trim() ? String(x) : fallback;
}

/** Fill the template. Missing narrative fields → honest "Not assessed"; missing
 * table bodies → an explicit empty-row marker (never a fabricated row). */
export function fillTemplate(input: ReportInput): string {
  const narrative = (k: keyof ReportInput) => val(input, k, NOT_ASSESSED);
  const rows = (k: keyof ReportInput) => val(input, k, EMPTY_ROW);
  const inline = (k: keyof ReportInput, fb = "—") => val(input, k, fb);

  const map: Record<string, string> = {
    network_name: inline("network_name"),
    date: inline("date"),
    run_id: inline("run_id"),
    mode: inline("mode", "full"),
    seed: inline("seed"),
    overall_confidence: input.overall_confidence, // single source → BLUF == Section 10
    cluster: inline("cluster"),
    assessed_actor: inline("assessed_actor", "Undetermined"),
    narratives_short: inline("narratives_short", "the observed narratives"),
    audience_short: inline("audience_short", "the observed audience"),
    breakout_category: inline("breakout_category", "Category 1 (not established)"),
    executive_summary: narrative("executive_summary"),
    scope: narrative("scope"),
    kiq_list: narrative("kiq_list"),
    tools_live: inline("tools_live", "none configured"),
    tools_not_configured: inline("tools_not_configured", "none"),
    collection_dates: inline("collection_dates"),
    fact_vs_assessment_note: FACT_ASSESSMENT_NOTE,
    actor_narrative: narrative("actor_narrative"),
    actor_table_rows: rows("actor_table_rows"),
    asset_table_rows: rows("asset_table_rows"),
    infrastructure_narrative: narrative("infrastructure_narrative"),
    infra_table_rows: rows("infra_table_rows"),
    underground_findings_or_none: inline("underground_findings_or_none", "None — dark-web module did not run."),
    narrative_analysis: narrative("narrative_analysis"),
    disarm_table_rows: rows("disarm_table_rows"),
    impact_evidence: narrative("impact_evidence"),
    ach_table_rows: rows("ach_table_rows"),
    playbook_comparison: narrative("playbook_comparison"),
    gaps: narrative("gaps"),
    next_steps: narrative("next_steps"),
    sources_numbered_with_links: narrative("sources_numbered_with_links"),
  };

  return REPORT_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    key in map ? map[key] : `{{${key}}}`,
  );
}

export interface CompiledReport {
  markdown: string;
  valid: boolean;
  violations: string[];
  version: string;
}

/** Validate then fill. An invalid report still compiles (so the analyst sees it)
 * but is flagged with its violations — never silently emitted as sound. */
export function compileReport(input: ReportInput): CompiledReport {
  const { valid, violations } = validateReport(input);
  return { markdown: fillTemplate(input), valid, violations, version: REPORT_COMPILER_VERSION };
}
