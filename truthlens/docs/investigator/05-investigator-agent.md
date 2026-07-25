# Task: THE INVESTIGATOR — a bounded autonomous investigative agent and its situation-report surface

> Read `CLAUDE.md` first, then the **Link Board task**, its **server/infrastructure extension**,
> **Case Synthesis v2** (`truthlens-case-synthesis-prompt-v2.md`), and the **Case Monitoring
> extension**. This is the fourth and final layer of that chain. It is an EXTENSION: the agent
> **consumes** `lib/case/*` and `lib/board/*` and adds no analytic machinery of its own.
> **Do not rebuild the ledger, the tiers, the clusters, the path, the ACH matrix, the validator,
> the rung ladder, or the alerting. The agent is a runtime, not a second analyst.**
>
> **Read this paragraph before writing any code.** Every mechanism in the previous three layers
> exists to stop a *human* analyst from drifting into a coherent story the evidence does not support.
> This layer removes the human from the loop and keeps the fluency. An autonomous investigator that
> collects, reasons, and concludes on a schedule is precisely the artifact those safeguards were
> built to constrain — and it will produce a persuasive, well-cited, entirely wrong case faster than
> any person could. Therefore: **the agent gets no privileged path.** Everything it concludes goes
> through the same ledger, the same timestamp tiers, the same weakest-load-bearing-link arithmetic,
> the same ACH scoring, the same citation validator, and the same rung ceiling as an analyst-driven
> case. Where the rules differ, they are **stricter** for the agent, never looser.
>
> **The design consequence that drives the phase order below: build the cage before the animal.**
> Authority limits, scope lock, budget accounting and the kill switch are Phase 1. The reasoning
> loop is Phase 3. An agent whose constraints are added afterwards has already run unconstrained in
> development, which is where the habits — and the tests that encode them — get set.

## Context

TruthLens — Next.js `^14.2.35` App Router, TypeScript, Vercel, KV (Upstash/Vercel-KV via
`lib/store.ts`), vitest + Playwright. LLM model from the centralized `LLM_MODEL` constant.

**Existing code the agent consumes — read it first:**
- `lib/case/{ledger,timeline,cluster,graph,path,narrate,lexicon,hypotheses,deception,assumptions,
  negative,predictions,grading,gaps,diff,shape,materiality,stability,schedule,decay,review,
  indicators}.ts` — the entire v2 case layer plus the monitoring extension.
- `lib/board/{orchestrate,links,calibrate}.ts`, `lib/clues/{extract,memory}.ts`,
  `lib/narrative/watch.ts` (alert/dedup/cooldown/triage), `lib/similarity/*`, `lib/cache.ts`,
  the Save-Page-Now helper, the PDF exporter.
- Collection tools the agent may invoke: Site Report, Post Check, Log Analyzer, Email Tracer,
  Monitor, Brand Watch.

ASSUMPTION: no new runtime dependency and no new external data source. The agent invokes existing
collectors through their existing interfaces; it gains no capability the platform does not already
have. If a phase appears to require a new capability, stop and report rather than adding one.

## Objective

An analyst opens **THE INVESTIGATOR**, supplies a seed set of 2–N entities and a question, and
starts a run. The agent plans what to collect by expected diagnostic value, collects within a hard
budget, integrates everything into the v2 case machinery, argues against its own leading conclusion,
stops when further collection would not change the answer, and issues a **situation report**: what
it concluded, at what likelihood and what confidence, on which rung of the linkage ladder, what
changed since the last report, what it looked for and did not find, what it never reached, what
would prove it wrong, and what it deliberately chose not to pursue. Running the agent twice over the
same evidence produces the same conclusions. A run that concludes **"no case established"** is a
complete and successful run.

## Requirements

### A. Authority, scope lock, and the kill switch (`lib/agent/authority.ts`) — build this first

1. **Rung ceiling.** The agent may autonomously reach `association`. It may **propose**
   `common-operation`, which enters a review queue and is not published until an analyst approves it.
   It may **never** reach `attribution` — that rung is human-only and additionally requires a
   completed deception assessment. Enforce in code at the point of publication, not in the prompt:
   a conclusion above the agent's ceiling is rejected by the same validator that rejects an uncited
   sentence, with the same visible drop record.
2. **Scope lock.** The seed entity set is a contract. The agent never adds an entity to a case. Newly
   discovered linked entities go to the existing candidate queue with their evidence and calibrated
   strength, and do not affect clusters, path, hypotheses, or the report until an analyst accepts them.
   Automatic expansion is how a two-entity board becomes a dragnet, and no run budget or urgency
   overrides this.
3. **Read-only in the world.** The agent collects, compares, reasons, and reports. It never contacts
   any party, never files a report anywhere, never submits a form, never authenticates to a service,
   and never acts against a domain or account. There is no configuration flag that enables any of this.
4. **Kill switch.** A synchronous stop checked between every phase and before every external call.
   When set, the run halts, writes a partial report marked `halted`, and never retracts anything
   (inherits the monitoring layer's degraded-coverage rule).
5. **Attributable initiation.** Every run records who started it, the scope, the question, the budget,
   and the authority ceiling in force. An unattributed run cannot start.
6. **No cross-case contamination.** The agent working case A may reuse *evidence* from case B — with
   B's provenance intact and re-graded independently — and may **never** import B's *conclusions* as
   evidence. Conclusions feeding conclusions is circular reinforcement that compounds silently across
   a workspace. Enforce with a type-level separation and a test.
7. **Confidence cannot be raised by re-reasoning.** Confidence and likelihood are computed in
   TypeScript from sourcing, corroboration, negative evidence and gaps. Re-running the LLM over an
   unchanged ledger must produce identical values. Without this, repeated passes inflate confidence
   with no new evidence — a failure mode that is invisible because each individual pass looks reasonable.

### B. Budget and coverage accounting (`lib/agent/budget.ts`)

8. Hard limits per run, all named exports: external calls, wall-clock, LLM tokens, hop depth from the
   seed set (default **1**, and hops never expand scope — they only inform the candidate queue),
   and maximum cycles.
9. Every limit reached marks the run `coverage: partial`, writes the uncollected artifacts into the
   gaps register with their reason, and — per the monitoring layer — permits the run to **add**
   findings while forbidding it to **remove** any. A budget-truncated run never retracts and never
   emits a regression alert. Our own incompleteness must never read as a change in the world.
10. Coverage is reported as a first-class field on the situation report, not a footnote.

### C. Planning by expected diagnostic value (`lib/agent/plan.ts`)

11. The agent does not collect breadth-first, and it does not collect what is easiest. It ranks
    candidate collection tasks by **expected diagnosticity**: how much a task's likely results would
    *separate* the current hypotheses, weighted by estimated cost and probability of success.
12. Candidate tasks come from the v2 `predictions.ts` table — the artifacts each live hypothesis
    predicts should exist — plus unresolved timestamp tiers (an archive lookup that would lift an
    entity from T4 to T2 and thereby establish an ordering is usually the highest-value task available
    and must rank accordingly) and unverified `contentHash` values.
13. Evidence that would be consistent with every hypothesis has zero diagnostic value regardless of
    how interesting it looks. Rank by discrimination, never by richness. This is what separates
    investigation from curation.
14. The plan is written to the journal **before** collection, with each task's expected diagnosticity
    and the reason it was chosen or skipped.

### D. The run loop and stopping rule (`lib/agent/loop.ts`, `lib/agent/stop.ts`)

15. Each cycle: check kill switch → plan → collect within budget → integrate into the case layer →
    recompute clusters, path, ACH, assumptions → run the adversarial pass (section E) → evaluate the
    stopping rule → decide.
16. **Hypotheses are generated before deep collection**, in the first cycle, and always include the
    null and the deception hypothesis. Anchoring is the agent's most likely failure: whichever
    explanation forms first will shape every subsequent collection choice, so the set must exist
    before the collection that would bias it.
17. **Stopping rule** — the agent stops when any fires, and the report names **which**:
    - *Diminishing diagnosticity*: the highest expected diagnosticity among remaining tasks falls
      below `DIAGNOSTICITY_FLOOR`. This is the principled stop and should be the common one.
    - *Stability*: the ACH ranking has been unchanged across `STABLE_CYCLES` cycles.
    - *Budget*: any hard limit reached → `coverage: partial`.
    - *Ceiling*: the conclusion has reached the agent's authority ceiling and further work would only
      support a rung it may not publish.
    - *Kill switch*.
18. **No-progress parking.** A scheduled case that completes `NO_PROGRESS_CYCLES` runs without new
    diagnostic evidence is parked with a short "no progress" report and stops consuming budget. It is
    never auto-closed and can be resumed. An agent that keeps running on a dead case generates noise
    that trains the analyst to ignore the channel.
19. **Determinism separation:** collection order may vary between runs; conclusions may not. Given an
    identical final ledger and identical version stamps, the case JSON and the report's judgment
    section must be byte-identical. Test this explicitly by replaying a recorded ledger.

### E. The adversarial pass (`lib/agent/adversary.ts`) — mandatory, not optional

20. Before any report is written, the agent runs a dedicated pass whose only job is to **build the
    strongest available case against its own leading conclusion**, using the same evidence. This is
    the single most important requirement in this task. Without it, an autonomous agent plus a fluent
    language model is a conspiracy wall operating at machine speed.
21. The pass must be written out in full and stored, not gestured at, and it must use actual evidence
    rather than hypotheticals. Its output is a first-class section of the report, never a footnote.
22. If the counter-case is not clearly weaker than the leading case under the same ACH inconsistency
    scoring, the verdict is **undetermined** and the report says so plainly. "The counter-case was easy
    to build" is itself a finding and must appear in the report when true.
23. The adversarial pass additionally re-runs the v2 Key Assumptions Check and the MOM-POP/MOSES/EVE
    deception checklist. Evidence that arrived unusually easily, or that points unusually neatly at the
    leading hypothesis, is weighted **down** — convenience is either luck or design, and the agent has
    no way to tell which.
24. Budget the adversarial pass separately so it can never be squeezed out by a collection overrun.
    It runs even on a halted or partial run.

### F. The journal (`lib/agent/journal.ts`)

25. Append-only reasoning trace, per run: every plan, every task chosen and skipped with its
    diagnosticity and reason, every hypothesis formed and when, every collection result, every
    integration, the adversarial pass in full, every stopping-rule evaluation, and every
    authority rejection.
26. This is the audit trail for the *reasoning*, complementing the chain of custody for the *evidence*.
    It is what makes the v2 post-hypothesis collection flag exactly computable: the journal knows when
    each hypothesis formed and `enteredCaseAt` knows when each item arrived, so evidence gathered
    *through* a theory is marked automatically rather than estimated.
27. The journal contains no person names, no account identities, and no free-text speculation outside
    labeled statements — it is subject to the same content rules as the report.
28. The journal is exportable and is included in the case export. An agent whose reasoning cannot be
    inspected after the fact is not auditable, and an unauditable investigator is not usable as evidence
    of anything.

### G. THE INVESTIGATOR — the surface (`app/investigator/`, `components/investigator/*`)

29. A tool surface alongside the existing six. Sections: **Run** (seed set, question, budget, schedule,
    authority ceiling — displayed, not editable upward), **Live** (current cycle, current task, budget
    consumed, kill switch), **Reports** (history of situation reports with diffs), **Journal**,
    **Review queue** (proposed `common-operation` conclusions and candidate entities awaiting approval).
30. The Live view shows what the agent is doing and why — the current task and its expected
    diagnosticity — not a spinner. An agent whose activity is opaque cannot be supervised, and
    supervision is the whole justification for autonomy.
31. All four v2 case views (Wall, Timeline, Ledger, Analysis) remain reachable from a report; the report
    is a lens on the case, never a separate store of truth.
32. Match the existing design system. Do not restyle other tools.

### H. The situation report (`lib/agent/sitrep.ts`)

33. Generate to this exact structure. Every section is required; an empty section renders as
    "none established" rather than being omitted, because a missing section reads as an absent problem.

```
STATUS          — active | parked | halted | complete.  Coverage: full | partial.
                  Stop condition that fired.  Authority ceiling in force.

BOTTOM LINE     — 2–3 sentences. The judgment, its likelihood, its confidence, and its rung.
                  Nothing else.

JUDGMENT        — likelihood and confidence stated separately and explicitly.
                  The load-bearing findings named — the ones the conclusion actually depends on,
                  from the v2 evidence-level sensitivity computation.

CHANGED SINCE LAST REPORT
                — previous judgment, new judgment, and the specific evidence that moved it.
                  Rung downgrades stated plainly as retractions.

KEY EVIDENCE    — finding | source | source grade | info credibility | timestamp + tier | diagnosticity

RECONSTRUCTION  — every statement labeled FACT / INFERENCE / ASSUMPTION / SPECULATION,
                  every one carrying evidence IDs. Orderings marked established or
                  "order not established".

THE CASE AGAINST — the adversarial pass, in full. Whether it was easy or hard to build.

KEY ASSUMPTIONS — each with confidence; load-bearing low-confidence assumptions first.

NEGATIVE EVIDENCE — what was predicted, searched for adequately, and not found.
GAPS              — what was never reached. Two separate lists, never merged.

WHAT WOULD CHANGE THIS — specific, collectable evidence. Doubles as the collection plan.

NOT PURSUED     — tasks the agent skipped, with the reason and their expected diagnosticity.
```

34. **`NOT PURSUED` is not padding.** An autonomous agent's most consequential decisions are the ones
    it made silently — what it declined to look at. Surfacing them is what lets an analyst catch a
    planner that has been systematically avoiding the evidence that would hurt the leading theory.
35. Report generation reuses the v2 narrator and its validator without exception: labels, citation
    validation, band and rung lexicon, drop counts shown. If validation removes more than half the
    generated statements, the report renders the no-reconstruction state and keeps the ledger,
    timeline, negative evidence and gaps — a shredded report is a signal, not something to paper over.
36. Reports are immutable, versioned, exportable to PDF and JSON with the source appendix, hashes,
    grades, journal, and every version stamp. The agent cannot mark its own report reviewed.

### I. Scheduling and alerts

37. Scheduled runs reuse the monitoring layer's authenticated cron endpoint, adaptive cadence, dedup,
    cooldown and flapping suppression. Do not build a second scheduler.
38. Alert only on: a published judgment change, a rung change in either direction, a load-bearing
    assumption failing, an indicator firing, a proposal entering the review queue, or a halted run.
    Everything else goes to the digest. Route through the Brand Watch pipeline with fingerprint
    `(caseId, changeKind, subjectKey)`.

## Technical decisions (follow these — do not re-litigate)

- New code: `lib/agent/{authority,budget,plan,loop,stop,adversary,journal,sitrep,types}.ts`,
  `app/api/agent/{run,stop,approve,journal}/route.ts`, `app/investigator/`,
  `components/investigator/*`. **No analytic logic outside `lib/case/*`** — if the agent needs a new
  analytic capability, it is added to the case layer with its own tests and consumed here.
- Every limit, floor, and cycle count is a named export in the module that owns it, versioned as
  `AGENT_POLICY_VERSION` and stamped onto every run and every report.
- The LLM is used for exactly three things: claim clustering (through the existing similarity
  interface), statement generation, and the adversarial pass. Planning, diagnosticity scoring,
  stopping, confidence, grading, and ranking are all computed in TypeScript and reproducible without
  the model. A model outage degrades the agent to a structural report; it never fabricates one.
- Runs are resumable: state in KV keyed `agent:run:{scope}:{id}`, checkpointed per cycle, scoped per
  user/workspace exactly as case memory is. Never global.
- Concurrency: one active run per case. A second start returns the existing run.

## Constraints & non-goals

- FROZEN: `CLAUDE.md`; disclaimers; `tests/ethics.test.ts` (add gates, never loosen); every rule
  inherited from the three prior layers.
- **Never:** an autonomous conclusion above `association`; automatic scope expansion; a person entity
  or named individual anywhere including the journal; any outbound contact, submission, authentication,
  or action against a domain or account; retraction from a partial-coverage run; conclusions imported
  as evidence across cases; confidence raised by re-reasoning; the agent marking its own output as
  reviewed; a report without its negative-evidence/gaps split, its adversarial pass, or its
  falsification list; a second scheduler or alerting system.
- Out of scope: new platform ingestion, actor attribution, per-individual profiling, multi-agent
  orchestration, agent-authored collection tools, predictive/forecasting features. Note deferrals in
  `NOTES.md`.
- Do not break the six existing tools or the analyst-driven case flow; regression-check after every phase.
- No new runtime dependency without listing it and stopping for approval first.

## Implementation plan (stop-gate at the end of each phase)

**P0 — Discovery + characterization (no production edits).** Read `CLAUDE.md`, `NOTES.md`,
`lib/case/*`, `lib/narrative/watch.ts`, `tests/*`. Write failing tests stating the target behavior: a
conclusion at `common-operation` is not published without approval; a discovered entity does not enter
the case; a partial run does not retract; re-running the LLM over an unchanged ledger does not change
confidence. Report the plan; stop.

**P1 — The cage: authority, scope lock, budget, kill switch.** `authority.ts`, `budget.ts`, run
records. No reasoning loop yet. Verify: P0's authority tests pass; the kill switch halts between
phases; an unattributed run cannot start; cross-case conclusion import fails to type-check.

**P2 — Planning and diagnosticity.** `plan.ts`. Verify: on a fixture with three hypotheses, the task
that would separate two of them outranks a richer task consistent with all three; an archive lookup
that would lift T4→T2 and establish an ordering ranks at the top; the plan is journaled before
collection.

**P3 — Loop, stopping rule, journal.** `loop.ts`, `stop.ts`, `journal.ts`. Verify: each stop condition
fires on its fixture and is named in the run record; hypotheses are formed before deep collection;
replaying a recorded ledger reproduces byte-identical conclusions; no-progress parking triggers.

**P4 — Adversarial pass and rung gating.** `adversary.ts`. Verify: the counter-case is generated,
stored, and rendered; a fixture where the evidence genuinely underdetermines the answer yields
`undetermined` with "the counter-case was easy to build" stated; a proposed `common-operation`
conclusion lands in the review queue and is absent from the published report until approved; an
`attribution`-rung statement is rejected with a logged drop reason.

**P5 — SITREP + THE INVESTIGATOR UI.** `sitrep.ts`, the four views, review queue, live view. Verify:
`npm run e2e`; every required section renders, empty ones as "none established"; `NOT PURSUED` is
populated; the >50% shred path renders correctly; the agent cannot mark its own report reviewed.

**P6 — Scheduling, alerts, export, regression.** Cron wiring, alert routing, PDF/JSON export including
the journal, full regression pass on all six tools and the analyst-driven case flow.

## Verification (definition of done)

- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` — all green.
- **Ethics gates (new tests):** no autonomous conclusion above `association`; no attribution-rung
  output under any input; no entity added to a case by the agent; no person name in report or journal;
  no outbound action of any kind reachable from agent code; no retraction from a partial run; no
  conclusion imported as evidence across cases; confidence unchanged by re-reasoning; the agent cannot
  self-review; reports always contain the adversarial pass, the negative-evidence/gaps split, and a
  non-empty falsification list.
- **Null-result scenario (the headline test):** run the agent on five unrelated entities that share only
  commodity infrastructure → it forms no cluster, reaches "no case established", stops on diminishing
  diagnosticity, and issues a complete report saying so. This run is a **success**, and the test asserts
  it produces no alert. An investigator that always finds something is worthless.
- **Anchoring scenario:** a seed set where the first-discovered artifact suggests a coordinated
  explanation, with later evidence favouring the null → the hypothesis set contains the null from cycle
  one, the ACH ranking flips, and the report's CHANGED SINCE LAST REPORT names the evidence that moved it.
- **Ceiling scenario:** evidence sufficient for `common-operation` → the conclusion enters the review
  queue, the published report states `association` with the proposal noted, and no alert claims the
  higher rung.
- **Truncation scenario:** the budget is exhausted after two of five entities → `coverage: partial`,
  three entities' artifacts recorded as gaps, no cluster retracted, no regression alert, adversarial
  pass still runs, report renders with the budget stop condition named.
- **Adversarial scenario:** a case where one artifact carries the entire conclusion → THE CASE AGAINST
  identifies that dependency, the verdict is `undetermined`, and the load-bearing item is named in
  JUDGMENT via the v2 sensitivity computation.
- **Determinism scenario:** replay a recorded ledger twice with different collection orderings →
  identical case JSON and identical judgment section.
- **Silent-avoidance scenario:** a planner fixture that systematically skips the task most likely to
  undercut the leading hypothesis → the skip appears in `NOT PURSUED` with its diagnosticity, making
  the pattern visible to a reviewer.

## Working style

One conventional commit per phase; stop for approval at each gate — this task especially, since P1
defines limits that later phases must not quietly widen. List any dependency before installing.
Final report: the authority matrix as implemented (rung → autonomous / proposal / forbidden); how the
scope lock is enforced and which test proves an entity cannot self-add; the diagnosticity scoring
function and its inputs; every stop condition with the test that fires it; how determinism of
conclusions is separated from variability of collection; the adversarial pass's separate budget and
what happens when the main budget is exhausted; which ethics gates you added; and what was deferred
(candidates for `NOTES.md`: analyst-authored hypotheses fed to the agent, multi-analyst review
workflows, cross-case correlation under explicit authorization, cost-aware scheduling).


