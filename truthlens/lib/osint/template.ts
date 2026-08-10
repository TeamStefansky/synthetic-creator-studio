// OSINT investigation report template (installed from templates/report-template.md).
// This constant is the compiler's source of truth; data/osint/report-template.md is
// the human-editable mirror (a test asserts they stay in sync). Placeholders are
// {{double_braced}} and filled by lib/osint/report.ts.

export const REPORT_TEMPLATE = `<!--
templates/report-template.md
The report compiler (src/report/compile.ts) fills this template.
Rules the compiler MUST enforce:
  - The BLUF confidence level MUST equal the Section 10 attribution confidence (no drift).
  - Every factual claim carries a source; load-bearing claims carry an Admiralty grade.
  - Fact and assessment stay visibly separate.
  - Brief mode keeps every section but tightens each and collapses tables to load-bearing rows.
Placeholders are {{double_braced}}.
-->

# Influence Operation Investigation: {{network_name}}

**Classification / Handling:** OSINT — open-source, for research use
**Date:** {{date}} · **Run ID:** {{run_id}} · **Mode:** {{mode}}
**Seed indicator(s):** {{seed}}
**Confidence key:** High / Moderate / Low · **Source grading:** Admiralty (A–F / 1–6)

## 1. BLUF & Executive Summary
BLUF: We assess **with {{overall_confidence}} confidence** that {{cluster}} is operated by {{assessed_actor}}, distributing {{narratives_short}} to {{audience_short}}; impact is Breakout {{breakout_category}}.
{{executive_summary}}
<!-- compiler check: the confidence word in this BLUF must match Section 10. -->

## 2. Scope, Tasking & Key Intelligence Questions
{{scope}}
KIQs:
{{kiq_list}}

## 3. Methodology & Confidence
Frameworks applied: ABCDE · DISARM · Breakout Scale · Admiralty · ACH.
Tools live this run: {{tools_live}} · Not configured: {{tools_not_configured}}.
Collection dates: {{collection_dates}}. {{fact_vs_assessment_note}}

## 4. Actor Mapping — Who Is Behind It
{{actor_narrative}}

| Actor / Org | Role in the operation | Evidence basis | Confidence |
|---|---|---|---|
{{actor_table_rows}}

## 5. Asset Inventory — Fake-News Sites & Inauthentic Assets
| Asset (name / domain / handle) | Type | Platform | Status | Notes / authenticity signals |
|---|---|---|---|---|
{{asset_table_rows}}

## 6. Distribution Infrastructure — The Technical Stack
{{infrastructure_narrative}}

| Selector / Indicator | Value | Linked assets | Pivot type | Collection date |
|---|---|---|---|---|
{{infra_table_rows}}

Underground / commercial stack (if the dark-web module ran): {{underground_findings_or_none}}
<!-- observation-only; grade forum claims low; state any boundary hand-offs to a vetted provider. -->

## 7. Narrative Analysis — The Payload
{{narrative_analysis}}

## 8. TTPs — DISARM Mapping
| DISARM phase | Technique observed | Evidence |
|---|---|---|
{{disarm_table_rows}}

## 9. Impact Assessment
Breakout Scale: {{breakout_category}}. {{impact_evidence}}

## 10. Attribution Assessment (Competing Hypotheses)
| Hypothesis | Supporting | Disconfirming | Verdict |
|---|---|---|---|
{{ach_table_rows}}

Assessed attribution: **{{assessed_actor}}** — **{{overall_confidence}} confidence**.
<!-- compiler check: this confidence MUST equal the BLUF in Section 1. -->

## 11. Comparison to Known Playbooks
{{playbook_comparison}}

## 12. Intelligence Gaps & Limitations
{{gaps}}

## 13. Recommended Next Collection Steps
{{next_steps}}

## 14. Sources
{{sources_numbered_with_links}}
`;
