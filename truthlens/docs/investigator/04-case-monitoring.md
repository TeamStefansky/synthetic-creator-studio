# Task: Extend Case Synthesis — continuous case monitoring, materiality-gated diff & alerting

> Read `CLAUDE.md` first, then the **Link Board task** (`truthlens-link-board-prompt.md`), its
> **server/infrastructure extension**, and the **Case Synthesis task**
> (`truthlens-case-synthesis-prompt.md`). This is an EXTENSION of Case Synthesis, not a standalone
> feature. It inherits everything: the evidence ledger with time tiers T1–T4, the weakest-bridging-
> link cluster confidence, the Moderate+-only cluster rule, the citation validator and band lexicon,
> the ACH matrix with its mandatory null hypothesis, the gaps register, and the Brand Watch
> alert/dedup/cooldown/triage pipeline. **Do not rebuild any of it — extend
> `lib/case/{diff,types}.ts` and add the modules named below.**
>
> **The governing principle of this extension:** a live case changes constantly while its *picture*
> does not. Domains re-resolve, headers drift, crawl times advance, archive snapshots trickle in —
> and none of that means anything happened. **The unit of change here is the conclusion, not the
> evidence.** If every ledger delta becomes an alert, the channel gets muted, and a muted monitor
> protects nobody.
>
> The second principle is its mirror and matters just as much: **our own incomplete collection must
> never read as a change in the world.** A run that exhausted its budget, hit a rate limit, or lost
> a source will look exactly like a cluster falling apart. Engineer against that specifically — a
> degraded run may add findings and may never retract them.
>
> **[v2] This extension targets `truthlens-case-synthesis-prompt-v2.md`**, which added chain-of-custody
> content hashing, independent source grading, the four-label reconstruction, separate likelihood and
> confidence axes, negative evidence held distinct from gaps, a standing deception hypothesis, the
> association → common-operation → attribution rung ladder, and the Key Assumptions Check. Three
> consequences drive the additions marked **[v2]** below: monitoring must warn on **indicators defined
> in advance** rather than patterns noticed afterwards; a changed judgment must state **what changed
> and why**, not merely that it did; and a source that silently rewrites itself while still returning
> 200 is a more important event than one that 404s, and is currently invisible.

## Context

Extends the `case` category and `lib/case/*` from the Case Synthesis task. Reuse: the immutable
snapshot store (`case:{scope}:{id}`) and all embedded version stamps
(`BOARD_RUBRIC_VERSION`, `TIME_RUBRIC_VERSION`, `NARRATIVE_PROMPT_VERSION`); `lib/case/diff.ts`;
`lib/case/{cluster,graph,path,hypotheses,gaps}.ts`; `lib/board/calibrate.ts`; the Brand Watch
scheduler auth, dispatch, dedup, cooldown, flapping suppression and triage layer in
`lib/narrative/watch.ts`; `lib/cache.ts`; the Save-Page-Now archival helper; `ConfidenceBadge`,
`EvidenceList`, the PDF/JSON exporters.

ASSUMPTION: no new runtime dependency and no new external data source. Scheduling uses the same
cron mechanism and the same authenticated-endpoint pattern already established for Brand Watch
scans.

## Objective

A case runs on a schedule and stays silent unless its **shape** changes. When the picture does
change, the analyst gets one deduped, actionable alert that says what changed, from what to what,
which evidence drove it, what else could explain it, and how complete that run's collection was —
linked to an immutable snapshot and a diff view. Everything below the alerting bar accumulates
into a digest instead of vanishing. An analyst returning after a week sees one consolidated
"what changed since you last looked," not seven runs of noise.

## Requirements

### A. Case shape hash — the first and cheapest gate (`lib/case/shape.ts`)

1. Compute `CaseShapeHash` over **conclusions only**: cluster membership sets, each cluster's
   bounded confidence, articulation edges, path edges *with established direction*, the
   `order not established` pair set, hypothesis ranking and the determined/undetermined verdict,
   and coverage status. It must **exclude** collection timestamps, collector versions,
   re-observations of known facts, and evidence ordering.
2. Identical shape hash across two runs ⇒ **zero alerts and zero diff-feed entries**, unconditionally,
   no matter how much the ledger churned. Implement this as an early return with its own test before
   anything else in this extension.

### B. Materiality classification (`lib/case/materiality.ts`)

3. Classify every diff item into exactly one tier:
   - **Structural** — a cluster merges or splits; a new Moderate+ edge; an articulation edge forms
     or collapses; a direction becomes established or is lost; an entity's cluster membership changes.
   - **Interpretive** — a hypothesis-ranking flip; `undetermined ⇄ determined`; a cluster or path
     confidence band changes; the narrative is rebuilt into a materially different account.
   - **Evidential** — new evidence, a new archive snapshot, a time-tier upgrade.
   - **Cosmetic** — the same fact re-observed, crawl time advanced, collector version bumped,
     ordering changed.
4. **Only Structural and Interpretive alert.** Evidential accumulates into the digest and the
   "since last review" badge. Cosmetic updates the ledger and is not written to the diff feed at all.
5. **Exception that must be implemented explicitly:** a time-tier upgrade that newly satisfies the
   directional test (e.g. an entity moves T4 → T2 and an `order not established` pair becomes an
   ordered path edge) is promoted from Evidential to **Structural**. This is the single most
   valuable alert this system can emit — the moment the sequence becomes provable. Give it its own
   test and its own alert copy.
6. All tier-assignment rules are a named, exported table in `lib/case/materiality.ts`, versioned as
   `MATERIALITY_VERSION` and stamped onto every diff record.

### B2. [v2] Indicators & Warning, defined in advance (`lib/case/indicators.ts`)

6a. Section B classifies changes **after** they occur. That is necessary and not sufficient: an
    indicator defined after the fact is pattern-matching on noise, and it is exactly how a monitoring
    system manufactures an escalation story out of ordinary variance. Every case therefore carries a
    set of **indicators declared before collection**, derived from the hypothesis set and the
    predicted-artifact table (`lib/case/predictions.ts`) that v2 already builds.
6b. An `Indicator` is `{ id, hypothesisId, description, observableArtifact, collectionPath,
    direction, expectedFalsePositiveRate, declaredAt }`, where `direction` states whether observing
    it **supports or undercuts** its hypothesis. Indicators that would fire on routine activity are
    rejected at declaration time — an indicator with a high false-positive rate is worse than none,
    because it trains the analyst to ignore the channel.
6c. When an indicator fires, it alerts at **Structural** tier regardless of what the generic
    classifier would have assigned, and the alert names the hypothesis it bears on and the direction.
    An indicator that **fails to fire within its declared window**, where collection was adequate,
    becomes **negative evidence** against its hypothesis through the v2 `negative.ts` path — and, per
    the four-condition test, becomes a **gap** instead if coverage was partial. Never let a
    non-firing indicator score under degraded coverage.

### C. Stability gating — anti-flapping (`lib/case/stability.ts`)

7. A new Moderate+ edge alerts only after it holds across `EDGE_CONFIRMATION_RUNS` consecutive runs
   (named export, default 2). **Exception:** edges derived from inherently stable T1 artifacts
   (GA/AdSense ID, RDAP creation date, CT log entry, favicon hash) alert on first observation —
   they do not flicker, and delaying them costs the analyst time for nothing.
8. Track per-case `churnRate` over a trailing window. An edge, cluster, or path arrow that
   oscillates across runs is marked **unstable**; its alerts are suppressed until it holds for
   `STABILITY_HOLD_RUNS` consecutive runs, and the instability itself is shown in the UI as a
   property of that element ("this link has appeared and disappeared 4 times — treat as unreliable").
   Route suppression through the existing Brand Watch flapping mechanism; do not write a second one.
9. A case whose churn rate exceeds `CHURN_CEILING` is flagged **volatile** at the top of the wall,
   and its narrative is not regenerated on every run — a case that will not sit still does not get a
   confident-sounding account rewritten under it each time.

### D. Coverage-safe scheduling (`app/api/case/scan/route.ts`, `lib/case/schedule.ts`)

10. Authenticated cron endpoint reusing the Brand Watch scan auth. Never publicly triggerable.
11. **Adaptive cadence**: a case with a recent material change scans at `MIN_INTERVAL`; a dormant
    case backs off exponentially to `MAX_INTERVAL` (named exports). A material change resets the
    cadence to the floor.
12. **Per-run collection budget** (external calls, wall-clock). When the budget is exhausted or a
    collector fails, the run is marked `coverage: partial` and every uncollected artifact is written
    into the **gaps register** with its reason — never silently skipped.
13. **The retraction rule — implement this as a hard guard, not a convention:** a run with
    `coverage: partial` may **add** findings and may **never remove** an edge, cluster, path arrow,
    or evidence item, and may never emit a regression alert. Only a `coverage: full` run may retract.
    Absence produced by our own budget is not evidence of absence. Test it directly with a fixture
    that starves the budget mid-run.
14. Every diff record and every alert payload carries the coverage status of the run that produced it.

### E. Evidence decay & regression alerts (`lib/case/decay.ts`)

15. Re-verify evidence source URLs on a slower cadence than collection. On a 404/410/DNS failure:
    - archive exists ⇒ evidence transitions to `archived-only`, the archive URL becomes the
      surviving record, and **strength is unchanged** — the fact was captured.
    - no archive ⇒ evidence transitions to `lost`.
    **Never delete an evidence item.** Deletion destroys the audit trail; state transitions preserve it.
16. When a conclusion rests **solely** on `lost` evidence, downgrade it (edge strength, cluster
    confidence, or path direction, per the existing rubrics) and emit a **regression alert**: the
    picture got weaker. An analyst who already acted on this case needs that as much as a new finding.
17. Opportunistically archive any not-yet-archived evidence supporting a Moderate+ conclusion, via the
    existing Save-Page-Now helper — decay is cheapest to prevent.

17a. **[v2] Silent content drift.** Re-verification compares the v2 `contentHash`, not just the HTTP
     status. A source returning 200 whose bytes no longer match is a **more** significant event than a
     404 and is currently invisible: the record now says something different from what the case rests
     on. Transition the evidence to `superseded`, create a new record for the current content with its
     own hash and acquisition metadata, keep both — never overwrite — and emit a Structural alert
     naming which conclusions relied on the superseded version. Where an archived capture of the
     original exists, the original retains its strength; where it does not, treat it as `lost`.
17b. **[v2] Assumption and deception re-assessment.** When drift, decay, or new evidence bears on an
     assumption flagged **load-bearing** in the v2 Key Assumptions Check, re-run that check and alert
     if its confidence drops — a failing load-bearing assumption is the most consequential change a
     live case can undergo, and it is invisible to a purely structural classifier. Likewise, re-run
     the MOM-POP/MOSES/EVE checklist when new evidence arrives that is unusually convenient for the
     leading hypothesis; convenience is weighted **down**, and a hypothesis that suddenly acquires
     tidy confirmation deserves the deception question asked again rather than assumed settled.

### F. Review state and consolidated diff (`lib/case/review.ts`)

18. Per case, per analyst scope: `lastReviewedAt` and `lastReviewedShapeHash`. The primary diff view
    renders **against the last reviewed snapshot**, not against the previous run, and consolidates
    every intervening run into one list.
19. An analyst can dismiss an individual change as a false positive. Dismissals are fingerprinted
    `(caseId, changeKind, subjectKey)`, suppress recurrence, are revocable, and are recorded with
    reason and timestamp as part of the case audit trail — a dismissal is a finding about the system
    and must be visible, not a silent mute.
20. **Never auto-close, auto-archive, or auto-resolve a case.**
20a. **[v2] State changes from prior judgments explicitly.** When a case's likelihood, confidence,
     hypothesis ranking, or ladder rung changes, the diff renders the **previous judgment, the new
     judgment, and the specific evidence that moved it** — in that form. A reader tracking a case over
     weeks needs the delta and its cause; a freshly generated summary that quietly contradicts last
     month's is the defect this requirement exists to prevent. Reserve a `judgmentDelta` field on
     every diff record and populate it whenever any of those four fields changed.
20b. **[v2] Never silently downgrade a rung.** A conclusion that moves from `common-operation` back to
     `association` is a retraction of a claim the analyst may have already acted on. It alerts, and
     the alert says so plainly.

### G. Case history — the wall gains memory (`app/case/[id]/history`)

21. A fourth view alongside Wall / Timeline / Ledger: the case's own history — "on 12 May the
    cluster split", "on 3 June direction A → B was established", "on 20 June the sole supporting
    artifact was lost". Each entry links to its immutable snapshot, and opening it renders the wall
    exactly as it looked then, guaranteed by the version stamps already stored on every snapshot.
22. Distinguish visually between changes in the world and changes in our knowledge — a new archive
    snapshot revealing an old fact is not the same event as a new fact appearing, and conflating the
    two is how a monitoring tool manufactures a story about escalation.

### H. Scope discipline — no automatic expansion

23. When continuous collection surfaces a **new entity** linked to a case entity, it goes into a
    **candidate queue** with its evidence and calibrated strength. It does **not** enter the case,
    does not affect clusters, hypotheses, path, or the narrative, and does not alert above digest
    level until an analyst explicitly accepts it.
24. This is a hard rule, not a UX preference: automatic expansion is precisely how a two-entity board
    becomes a dragnet. Cover it with an ethics test.

### I. Alerting and digest

25. Alert payload: what changed, from → to, the evidence that drove it, the mandatory
    type-specific alternative, the run's coverage status, the stability state of the element, and
    links to the snapshot and the diff view. Route entirely through the Brand Watch pipeline with
    fingerprint `(caseId, changeKind, subjectKey)`. Do not build a second alerting system.
26. **Digest**: a scheduled rollup of everything below the alerting bar — evidential changes,
    candidate entities, suppressed unstable elements, partial-coverage runs. Nothing is invisible;
    it is merely quiet.

## Technical decisions (follow these — do not re-litigate)

- New code: `lib/case/{shape,materiality,stability,schedule,decay,review}.ts`, extensions to
  `lib/case/{diff,types,gaps}.ts`, `app/api/case/scan/route.ts`,
  `app/api/case/[id]/{review,dismiss,candidates}/route.ts`, the history view and UI additions.
- Every threshold — `EDGE_CONFIRMATION_RUNS`, `STABILITY_HOLD_RUNS`, `CHURN_CEILING`,
  `MIN_INTERVAL`, `MAX_INTERVAL`, per-run budget, decay re-verify cadence — is a named export in the
  module that owns it, never an inline literal, and is covered by `MATERIALITY_VERSION` or the
  existing rubric stamps.
- Snapshots stay immutable and append-only. Retention: cap the number retained per case as a named
  export, document the window, and delete all snapshots, diffs, dismissals and candidates when the
  case itself is deleted.
- Case monitoring is scoped per user/workspace exactly as case memory is. A scheduled scan never
  crosses scope; anonymous mode is not scheduled at all and stays local-only.
- Determinism carries over: the same evidence set and the same version stamps produce the same
  shape hash and the same classification, run to run.

## Constraints & non-goals

- FROZEN: `CLAUDE.md`; disclaimers; `tests/ethics.test.ts` (add gates, never loosen); every rule
  inherited from the three prior tasks — no person nodes, no ownership/control/coordination or
  state attribution, no uncited narrative sentence, no direction from T3/T4, no weak-edge clusters.
- **Never:** an alert that asserts intent, escalation, or a campaign; automatic addition of an entity
  to a case; automatic action, reporting, or contact regarding any domain or account; deletion of
  evidence; a retraction or regression alert from a partial-coverage run; a second alerting system;
  a globally shared monitoring namespace.
- Out of scope: new platform ingestion (Telegram/X/Meta), actor attribution, per-individual
  profiling, multi-analyst collaboration and shared case ownership, predictive/forecasting features.
  Note deferrals in `NOTES.md`.
- Do not break the six existing tools or the one-shot case flow; regression-check both after every phase.
- No new dependency without listing it and stopping for approval first.

## Implementation plan (stop-gate at the end of each phase)

**P0 — Discovery + characterization (no production edits).** Read `lib/case/*`,
`lib/narrative/watch.ts`, `tests/*`. Build fixtures of two consecutive case runs differing only in
crawl times, and a pair differing by a genuine cluster split. Write failing tests: churn-only rerun
must produce zero diff entries; a partial-coverage run must not retract. Report the plan; stop.

**P1 — Shape hash + materiality classifier.** `shape.ts`, `materiality.ts`, extend `diff.ts`.
Verify: churn-only test now passes; the classification table is covered case-by-case, including the
tier-upgrade-promotes-to-structural rule; `npx tsc --noEmit`.

**P2 — Stability gating + dismissals.** `stability.ts`, dismissal fingerprints wired to the Brand
Watch suppression layer. Verify: an oscillating edge across four synthetic runs yields at most one
alert and is marked unstable; a T1-derived edge alerts on first observation; a dismissal suppresses
recurrence and is revocable.

**P3 — Scheduler + budget + coverage guard.** `schedule.ts`, the authenticated scan endpoint.
Verify: unauthenticated scan is rejected; cadence backs off and resets correctly; the starved-budget
fixture produces `coverage: partial`, records gaps, retracts nothing, and alerts not at all.

**P4 — Decay + regression alerts.** `decay.ts`. Verify: a 404 with an archive keeps strength and
emits no alert; a 404 without an archive marks the evidence `lost`, downgrades the sole conclusion
resting on it, and emits exactly one regression alert; no evidence row is ever deleted.

**P5 — Review state, history view, candidate queue, digest.** Verify: `npm run e2e`; manual — run a
case four times with mixed changes, confirm the "since last review" list consolidates them
correctly, the history view reproduces an old snapshot faithfully, and a newly discovered linked
domain appears only in the candidate queue with the case untouched until accepted.

## Verification (definition of done)

- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` — all green.
- **Ethics gates (new tests):** no entity is added to a case without explicit acceptance; no alert
  text asserts intent, coordination, or attribution; no evidence deletion; monitoring scope is
  isolated per workspace; a partial run never retracts and never regression-alerts.
- **Churn scenario (headline test):** re-run a case where only crawl times and collector versions
  changed → identical shape hash, zero diff entries, zero alerts, zero narrative regeneration.
- **Tier-upgrade scenario:** an archive snapshot lifts an entity from T4 to T2 and an
  `order not established` pair becomes an ordered path edge → exactly one Structural alert naming
  the newly established sequence and the evidence that established it.
- **Starved-budget scenario:** the budget is exhausted after collecting two of five entities → run
  marked `coverage: partial`, three entities' artifacts recorded as gaps, the previously-known
  cluster remains intact, and no alert of any kind is emitted.
- **Flapping scenario:** an edge appears, disappears, reappears, disappears across four runs → at
  most one alert total, the edge is marked unstable, and the UI states its oscillation count.
- **Decay scenario:** the sole GA-ID evidence behind a Strong edge 404s. With an archive → strength
  unchanged, no alert. Without an archive → evidence `lost` (not deleted), edge downgraded, one
  regression alert carrying the alternative.
- **[v2] Silent-drift scenario:** an evidence source returns 200 but its content hash no longer
  matches → the original is `superseded` not overwritten, a new record is created with its own hash,
  one Structural alert names the conclusions that relied on the old version, and with an archived
  capture present the original's strength is unchanged.
- **[v2] Indicator scenario:** an indicator declared in advance fires → a Structural alert naming its
  hypothesis and direction, regardless of the generic classifier's tier. The same indicator failing to
  fire within its window under **full** coverage → negative evidence scored against that hypothesis;
  under **partial** coverage → a gap scored at zero, with the ranking unchanged.
- **[v2] Judgment-delta scenario:** new evidence moves a cluster from `moderate` to `high` confidence
  → the diff renders previous judgment, new judgment, and the specific evidence that moved it; a rung
  downgrade in the other direction alerts and states the retraction plainly.
- **Expansion scenario:** a newly discovered domain shares a Strong artifact with a case entity →
  it appears in the candidate queue only; clusters, path, hypotheses and narrative are byte-identical
  to the previous run; no alert above digest level.

## Working style

One conventional commit per phase; stop for approval at each gate. List any dependency before
installing. Final report: the materiality table as implemented (change → tier → alerts?), the exact
list of fields included in and excluded from the shape hash and why, how the partial-coverage
retraction guard is enforced and which test proves it, the evidence state machine
(`live → archived-only → lost`) with its strength consequences, which ethics gates you added, and
what was deferred (candidates for `NOTES.md`: passive-DNS change history, analyst-authored
hypotheses updated over time, cross-case correlation, shared case ownership).


