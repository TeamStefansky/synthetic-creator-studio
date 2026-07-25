# Task: Extend THE INVESTIGATOR — documented investigative methodology as enforced machinery

> Read `CLAUDE.md` first, then the **Link Board task**, its **server/infrastructure extension**,
> **Case Synthesis v2**, the **Case Monitoring extension**, and **THE INVESTIGATOR agent task**.
> This is an EXTENSION of the agent, not a standalone feature. It adds no new tool surface and no new
> data source: it upgrades `lib/agent/*` and `lib/case/*` in place.
>
> **What this task is.** The agent currently reasons well but improvises its method. This task installs
> the documented methodology of forensic science, criminal investigative analysis, and intelligence
> analytic doctrine as **executable machinery** — collection planning that traces every action to a
> decision, discriminating power expressed in the rigorous forensic vocabulary of class versus
> individual characteristics, examination sequenced so that context cannot bias comparison, blind
> verification, a measured error rate, behavioral signature separated from operational method, staging
> detection through effort asymmetry, and a standing dissent function that the main analytic line
> cannot overrule.
>
> **The governing principle, and the reason several famous techniques are absent below:** a method
> imported without its surrounding controls, its legal basis, and its measured error rate is a
> liability dressed as rigor. Every technique here arrives with the constraint that makes it valid in
> its own field. Techniques whose controls cannot be reproduced in this context — HUMINT tradecraft,
> surveillance, targeting cycles, person profiling, polygraph-adjacent statement scoring — are
> excluded by requirement, not by omission, because their institutional prestige makes them exactly
> the things an agent would otherwise reach for.

## Context

TruthLens — Next.js `^14.2.35` App Router, TypeScript, Vercel, KV, vitest + Playwright. LLM model from
the centralized `LLM_MODEL` constant.

**Code this task modifies:** `lib/agent/{plan,adversary,loop,stop,journal,sitrep,authority}.ts`;
`lib/case/{hypotheses,deception,predictions,indicators,graph,narrate,lexicon}.ts`;
`lib/board/calibrate.ts`. **New:** `lib/agent/{collection-plan,examine,dissent,premortem,
validation}.ts`, `lib/case/signature.ts`, `fixtures/method-validation/*`.

ASSUMPTION: no new runtime dependency and no new external data source. Signature extraction uses
content and headers the pipeline already retrieves; betweenness centrality is implemented in the
existing `lib/case/graph.ts` alongside the articulation-point code.

## Objective

Every collection action traces upward to a stated decision requirement. Every shared feature is
classified as a class or an individual characteristic with a base rate, and class features alone can
never support a common-source conclusion regardless of how many accumulate. Artifacts are assessed for
sufficiency before anyone knows what they would prove, compared without access to the case theory, and
independently re-derived without sight of the first conclusion. The system publishes its own measured
false-positive rate. Operational method is separated from behavioral signature, and effort asymmetry
feeds deception assessment as a positive indicator. A standing dissent function runs on every report
with a budget the main line cannot touch and the authority to force `undetermined`. And the agent
monitors itself for the one failure that matters most: a leading hypothesis that has stopped
accumulating contradictions.

## Requirements

### A. Collection doctrine — PIR → EEI → indicator → task (`lib/agent/collection-plan.ts`)

1. The analyst's question is decomposed into **PIRs** (few, decision-relevant), each into **EEIs**
   (the specific facts required to answer it), each into **indicators** (reuse `lib/case/indicators.ts`
   — declared in advance, with direction and expected false-positive rate), each into **tasks**
   (concrete collection actions with cost and probability of success).
2. **A task that does not trace upward to a PIR is rejected by the planner.** Untraceable tasks are
   curiosity, and curiosity is what exhausts budgets and fills boards with non-diagnostic material.
   Log every rejection to the journal with the task and the reason.
3. The **collection plan matrix** (PIR × EEI × indicator × source × status) is persisted and rendered.
   It doubles as the gaps register: every unfilled cell is a *known* gap. This is the difference
   between disciplined incompleteness and false confidence, and it must be visible as a matrix rather
   than described in prose.
4. Expected-diagnosticity ranking (from the agent task) now operates **within** this structure, not
   instead of it: tasks are ranked inside their EEI, and EEIs inside their PIR.

### B. Class vs. individual characteristics (`lib/board/calibrate.ts`, extended)

5. Every artifact type in the calibration table carries `characteristicClass ∈ { class, individual }`
   and a `baseRate` estimate with the provenance of that estimate. **An artifact type whose base rate
   cannot be estimated is `class` by default** — the burden is on individuation, not on commonality.
   - *class*: CDN, ASN, registrar, nameserver provider, country, server banner, CMS, content type,
     TLS provider, mass-hosting IP.
   - *individual*: analytics/AdSense identifier, favicon hash, self-signed certificate fingerprint,
     near-duplicate content signature, distinctive build artifact, idiosyncratic error string.
6. **The hard rule, and it supersedes the existing combination cap: class characteristics never
   individualize.** Any number of class features narrows a population and can never identify. Encode
   as: evidence consisting solely of class characteristics is capped at `Moderate`, can never form a
   cluster on its own, and **can never support the `common-operation` rung** — that rung requires at
   least one individual characteristic. This is the forensic version of "weak never sums to strong,"
   and it is stronger because it states the reason.
7. Bump `BOARD_RUBRIC_VERSION`. Every existing artifact type must be classified in this task; an
   unclassified type fails a schema test rather than defaulting silently.

### C. Examination discipline — sufficiency, context firewall, blind verification (`lib/agent/examine.ts`)

8. **Sufficiency before comparison.** Assess each questioned artifact on its own merits against a
   fixed threshold table and record the decision *before* any comparison runs. Deciding whether an
   artifact is good enough after seeing what it would prove is how weak evidence gets promoted, and it
   happens to careful analysts and to well-prompted models alike.
9. **Context firewall (Linear Sequential Unmasking).** The comparison function receives task-relevant
   information only. It must not receive, and must not be able to reach, the current hypothesis
   ranking, the leading explanation, the analyst's framing of the question, or any prior conclusion
   about the entities involved. Implement as a deliberately narrow input type, and add a test asserting
   the hypothesis state is unreachable from the comparison module. Contextual bias is a property of
   expert cognition, not of weak examiners, which is why the fix is architectural rather than an
   instruction.
10. **`inconclusive` is a first-class outcome** of every comparison, alongside identification and
    exclusion, and it is expected to be frequent. A comparison layer that rarely returns it is not
    being applied correctly — flag that in the validation report (section D) if its rate falls below
    `INCONCLUSIVE_FLOOR`.
11. **Blind verification.** Any conclusion resting on an individual characteristic, and any conclusion
    the agent would publish at `association` rung or propose above it, is independently re-derived by
    a second pass using a different collector or method where one exists. The verifier does not see the
    first conclusion. **Disagreement yields `inconclusive` — never an average, never the stronger of
    the two.** Non-blind verification measures agreeableness rather than evidence and is worse than
    none, because it manufactures the appearance of independent confirmation.

### D. Measured error rate (`lib/agent/validation.ts`, `fixtures/method-validation/*`)

12. Maintain a standing fixture suite: **known-negative** sets (entities certain to be unrelated,
    including the hard cases — shared mass hosting, shared registrar, same CMS, same country, same
    news cycle) and **known-positive** sets (entities with documented common operation).
13. Run the suite on every change to `BOARD_RUBRIC_VERSION`, `TIME_RUBRIC_VERSION`, `GRADING_VERSION`,
    `MATERIALITY_VERSION`, or `AGENT_POLICY_VERSION`, and in CI. **A change that pushes the measured
    false-positive rate above `FPR_CEILING` fails the build.**
14. Publish the measured false-positive rate, the sample size, and the fixture-suite version **on every
    situation report**. A system that asserts reliability without a measured error rate is asking to be
    trusted rather than checked.
15. The known-negative set matters more than the known-positive one and must be the larger of the two.
    Finding connections that exist is easy; the question is whether the method invents them where they
    do not.

### E. Method vs. signature, and staging detection (`lib/case/signature.ts`)

16. Separate every behavioral feature into:
    - **MO** — what the operation *needs*: hosting, registrar, CDN, platform, publishing tool. Learned,
      adaptive, cheap to change under pressure.
    - **Signature** — what it does *not* need but repeats anyway: idiosyncratic phrasing and recurring
      error patterns, image-processing habits and re-encode artifacts, publishing rhythm, consistent
      transliteration choices, the same broken markup carried across properties, template misuse.
17. **Signature outweighs MO** in link strength, because MO changes under pressure and signature
    persists under it. A signature match is closer to an individual characteristic than to a class one,
    and the calibration table must reflect that — with the caution that shared tooling and shared
    templates produce shared signatures innocently, so each signature type still carries its own base
    rate and alternative.
17a. **The processing-baseline gate — this qualifies requirement 17 and must be implemented with it,
     not after it.** Between the event and our collection, something processed the artifact: CDN
     minification, image pipelines, platform transcoding, caches, archive rewriting, AMP transforms,
     Unicode normalization, security gateways. **Shared processing masquerades as shared signature** —
     two unrelated sites using the same image optimizer produce identical re-encode artifacts, and two
     behind the same edge produce identical markup quirks. Counting those as behavioral matches
     manufactures links at scale in a way that looks impressively technical, and it is the highest-volume
     false-positive source this extension could introduce.
     Therefore: before any signature feature contributes strength, compute the **processing baseline**
     for that entity's detected toolchain (CDN, CMS, image pipeline, platform) and subtract it. A
     feature indistinguishable from what the toolchain produces for every user is a **class**
     characteristic of the toolchain, never an individual characteristic of an operator, and is scored
     as such by the section B rules. Only residual variation the toolchain does not impose can carry
     weight. Baselines live in `lib/case/baseline.ts` with their provenance, and an unknown toolchain
     means the feature is treated as baseline-explained until shown otherwise.
17b. Apply the same discipline to time: before an inconsistent timestamp feeds the deception
     hypothesis, identify which layer could have rewritten it. A cache-derived or archive-rewritten
     time is not a subject's lie.
18. **Staging detection through effort asymmetry.** Compute an operational-effort profile per entity
    (opsec indicators: privacy protection, infrastructure separation, content hygiene, metadata
    stripping). An operation displaying consistent sophistication *except* at one conveniently
    discoverable point is either careless in a very specific place or arranged to be found. Surface
    effort asymmetry as a **positive MOM-POP indicator** feeding the deception hypothesis in
    `lib/case/deception.ts` — this is what turns deception from an unfalsifiable mood into a checkable
    test.

### F. Standing dissent and the conception monitor (`lib/agent/dissent.ts`)

19. Upgrade the adversarial pass from a phase into a **standing function** with four properties, all
    tested:
    - Its budget is **reserved and cannot be reduced** by collection overruns, by the main line, or by
      any configuration a run can set.
    - It has the **authority to force `undetermined`** — a veto, not a recommendation. The narrator
      cannot overrule it, soften it, or summarize it away.
    - It runs on **every** published report, including halted, partial, and no-progress runs.
    - Its output is stored verbatim and rendered in full. Truncation is a defect.
    A dissent function the main line can dismiss is decoration, which is precisely why it must be
    structural rather than procedural.
20. **The conception monitor.** Track, per hypothesis and per cycle, the ratio of newly integrated
    evidence scored **inconsistent** with the leading hypothesis, against total newly integrated
    evidence. When that ratio falls below `CONCEPTION_FLOOR` while collection volume holds steady:
    - raise a **conception warning** on the report, worded as a warning about the analysis and not
      about the subject;
    - force regeneration of the hypothesis set and a full ACH re-run, discarding the prior ranking;
    - journal the event with the ratio series.
    A leading hypothesis that has stopped accumulating contradictions is usually not becoming truer —
    it is becoming a filter. This monitor is the single most valuable self-check in the system, because
    it detects the failure mode that every other control in this chain assumes will not happen.
21. **Pluralism where it is cheap:** where two independent methods can answer the same EEI, run both
    and record disagreement as a finding rather than resolving it silently.

### G. Premortem and structured self-critique (`lib/agent/premortem.ts`)

22. Before any report is published, run a **premortem**: assume it is six months later and this
    judgment was proven badly wrong, and explain how. Output is labeled statements, stored, and
    rendered in the report. Prospective hindsight surfaces failure paths that "what could go wrong?"
    reliably misses, because it removes the need to defend the conclusion while critiquing it.
23. Run a mechanical **structured self-critique** checklist — sources, assumptions, diagnosticity,
    alternatives, deception, gaps, changed circumstances — with each item resolved rather than
    acknowledged. Unresolved items appear in the report.

### H. Network analysis with its boundary attached (`lib/case/graph.ts`, extended)

24. Add **betweenness centrality** alongside the existing articulation-point computation, to identify
    brokers — the nodes whose removal most fragments the structure, and the nodes that span language or
    platform gaps.
25. **Every centrality value renders with its collection boundary attached** — the seed set and the hop
    depth that produced the graph. A node is central partly because you looked at its neighbourhood,
    and a sampled network's centrality ranking is frequently an artifact of the sampling. The validator
    rejects any generated statement citing centrality without the boundary.

### I2. Order of volatility and dual-tool verification (`lib/agent/collect-order.ts`)

25a. **Collect most-perishable first.** Acquisition takes time and the world does not wait. Ordering
     for this domain: live page content and current DNS answers → platform posts and their engagement
     state → ephemeral formats → registry and certificate records → archives. Registry records are
     stable; a post is not. Collecting stable material first because it is cheaper is how the
     perishable evidence is lost, and the planner's cost ranking will otherwise do exactly that —
     apply volatility as a **hard ordering constraint above diagnosticity ranking**, not as a tiebreak.
25b. Every collection records its acquisition time; findings describe the world at acquisition, not at
     analysis, and the report says so.
25c. **Dual-tool verification.** A load-bearing finding must be reproducible with a **second
     independent tool or method** before it can carry a conclusion. This is distinct from the blind
     verification in section C and catches a different error: blind verification controls the
     *examiner*, dual-tool controls the *instrument*. A single resolver, WHOIS proxy, or similarity
     implementation can be stale or subtly misconfigured in ways no careful examination reveals.
     Where two tools disagree, **the disagreement is the finding** — record it, never pick the fitting one.

### I3. Target and audience analysis (`lib/case/audience.ts`)

25d. Analyze what the operation's targeting reveals about the operator, at **community and audience-segment
     level only**: language register and dialect choice, platform and community entry points, which
     existing grievance the content attaches itself to, and timing relative to the target community's
     calendar rather than the operator's.
25e. Weight **mismatches** highest — content that misreads its own audience (wrong register, dated
     references, mistranslated idiom, imported framing with no local counterpart) indicates distance
     between operator and audience and is among the more reliable tells available. Each carries its own
     alternative: a non-native contractor, a translation tool, or a diaspora author explains the same
     signal.
25f. **Hard boundary, enforced by an ethics test:** this analysis describes the *operation's model of an
     audience*. It must never produce, and the schema must not be able to represent, an assessment of
     named individuals or a list of people characterized as susceptible. That artifact is a targeting
     product and inverts the purpose of the tool.

### I4. Structured pluralism (`lib/agent/pluralism.ts`)

25g. **Team A / Team B** for consequential or contested cases: two independent analyses of the same
     ledger with different starting assumptions, neither able to see the other's interim reasoning
     (reuse the section C firewall). The product is the **comparison** — convergence earns confidence,
     divergence localizes the real uncertainty. Gate it behind a cost threshold; it is not for routine
     findings.
25h. **Multiple scenarios generation** when evidence underdetermines the answer, which is the common
     case: identify the two or three key drivers, vary them, and emit the resulting accounts as
     what-would-have-to-be-true statements, each with its own indicators fed back into
     `lib/case/indicators.ts`.
25i. **Argument mapping**: render each judgment's inference chain explicitly — claim, premises, the
     warrant connecting them, and objections attached where they bite. Most analytic errors are
     invisible in prose and obvious in a map, because prose lets a warrant stay unstated while a map has
     a visible empty box. Render it as a view on the report; a judgment whose map has an unstated
     warrant is flagged rather than published silently.

### I. Excluded methods — enforced, not merely omitted

26. The following are forbidden and covered by ethics tests, because their institutional prestige makes
    them the things an agent would otherwise reach for: HUMINT tradecraft of any kind (elicitation,
    source recruitment, cover, asset validation); surveillance, tracking, or covert access; targeting
    cycles or any action-oriented process; psychological or behavioral profiling of named individuals
    — behavioral analysis applies to **operations**, never to persons; polygraph-adjacent or
    statement-analysis scoring instruments, which lack the validation to carry weight in a documented
    judgment whatever their pedigree.
27. Excluding these is not caution for its own sake: each is a method whose surrounding controls, legal
    basis, or measured error rate cannot be reproduced in this context.

## Technical decisions (follow these — do not re-litigate)

- All new thresholds — `FPR_CEILING`, `INCONCLUSIVE_FLOOR`, `CONCEPTION_FLOOR`, sufficiency thresholds,
  reserved dissent budget — are named exports in the module that owns them, versioned under
  `METHOD_VERSION`, and stamped onto every run and report.
- The context firewall is enforced by **types**, not by convention: the comparison module's input type
  simply does not include hypothesis state, and the test asserts it is unreachable.
- The LLM's role does not expand. Sufficiency thresholds, characteristic classification, base rates,
  effort profiles, centrality, error rates, and the conception ratio are all computed in TypeScript.
  The model generates statements, the dissent case, and the premortem — nothing that determines a score.
- Signature extraction runs on already-retrieved content; it introduces no new fetching and no new
  source.

## Constraints & non-goals

- FROZEN: `CLAUDE.md`; disclaimers; `tests/ethics.test.ts` (add gates, never loosen); every rule
  inherited from the four prior layers — no person nodes, no autonomous conclusion above `association`,
  no scope expansion, no outbound action, no retraction from partial coverage.
- **Never:** a `common-operation` rung supported only by class characteristics; a comparison that can
  see the case theory; a non-blind verification counted as confirmation; a report without its measured
  error rate; a dissent pass that was skipped, truncated, or overruled; a centrality claim without its
  collection boundary; any excluded method from section I.
- Out of scope: new platform ingestion, new external sources, multi-agent orchestration, agent-authored
  collection tools. Note deferrals in `NOTES.md`.
- Do not break the six existing tools, the analyst-driven case flow, or the agent's existing contract;
  regression-check after every phase.
- No new runtime dependency without listing it and stopping for approval first.

## Implementation plan (stop-gate at the end of each phase)

**P0 — Discovery + characterization.** Read the four prior layers and `tests/*`. Write failing tests:
class-only evidence cannot reach `common-operation`; the comparison module cannot access hypothesis
state; a task without a PIR is rejected; dissent cannot be skipped. Report the plan; stop.

**P1 — Characteristic classification + rung gate.** Extend `lib/board/calibrate.ts`; classify every
artifact type with a base rate and provenance; bump the rubric version. Verify: schema test — no
unclassified type; twenty class features never produce identification; `common-operation` requires an
individual characteristic.

**P2 — Validation harness.** `validation.ts`, the fixture suite, CI gate. Verify: the suite runs; the
known-negative set is larger; a deliberately loosened threshold pushes FPR above ceiling and **fails the
build**. Land this before the remaining behavioral changes so every subsequent phase is measured.

**P3 — Collection doctrine.** `collection-plan.ts`; rewire `plan.ts`. Verify: untraceable tasks
rejected and journaled; the matrix renders and populates the gaps register; diagnosticity ranks within
EEI within PIR.

**P4 — Examination discipline.** `examine.ts`. Verify: sufficiency recorded before comparison; the
firewall test passes; blind verification disagreement yields `inconclusive`; the inconclusive rate is
reported.

**P5 — Signature, baseline, and staging.** `lib/case/signature.ts`, `lib/case/baseline.ts`,
`lib/agent/collect-order.ts`, deception wiring. **Build the processing baseline before crediting any
signature strength** — the two land in the same phase because signature scoring without the baseline
gate is the largest false-positive source in this task. Verify: a fixture pair sharing only hosting
scores below a pair sharing a recurring error string; the same-CDN/same-optimizer fixture credits **no**
signature strength; shared-template innocence is represented in the alternative; effort asymmetry raises
a MOM-POP indicator on a staged fixture; volatility ordering overrides diagnosticity ranking;
dual-tool disagreement is recorded as a finding.

**P6 — Dissent, conception monitor, premortem, pluralism.** `dissent.ts`, `premortem.ts`,
`pluralism.ts`, `lib/case/audience.ts`. Verify: the reserved budget survives a collection overrun; the
veto forces `undetermined` and the narrator cannot soften it; a synthetic cycle series with a
collapsing inconsistency ratio raises the conception warning and forces hypothesis regeneration; the
premortem renders; Team A/Team B run without sight of each other and the comparison is the product; the
argument map flags an unstated warrant; audience analysis cannot represent a named individual.

**P7 — Report surfacing + regression.** Error rate, collection matrix, dissent, premortem, centrality
boundaries, and the conception warning all rendered on the situation report and included in exports.
Full regression across all six tools, the case flow, and the agent.

## Verification (definition of done)

- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` — all green.
- **Ethics gates (new tests):** no excluded method reachable from agent code; no person-level behavioral
  profiling; class-only evidence never reaches `common-operation`; every report carries a measured error
  rate; dissent output is present, complete, and unmodified; centrality statements carry their boundary.
- **Class-characteristic scenario (the headline test):** two entities sharing CDN, ASN, registrar,
  nameserver provider, country, CMS, server banner and content type — eight shared class features and
  nothing individual → **no cluster, no `common-operation` proposal**, capped at Moderate, and the
  report states that class features narrow a population and cannot identify.
- **Firewall scenario:** run the same comparison twice with opposite hypothesis rankings injected into
  the surrounding case state → byte-identical comparison output. The test fails if the module can even
  read the ranking.
- **Blind-verification scenario:** two independent methods disagree on an individual characteristic →
  `inconclusive`, not the stronger reading, and the disagreement appears in the report.
- **Error-rate scenario:** loosen a threshold so that a known-negative pair links → CI fails with the
  measured FPR and the offending fixture named.
- **Signature scenario:** pair A shares hosting and registrar (MO only); pair B shares a recurring
  malformed markup pattern and identical image re-encode artifacts (signature) → B ranks materially
  higher, and B's alternative explicitly covers shared tooling.
- **Staging scenario:** an entity with privacy protection, separated infrastructure and stripped
  metadata everywhere except one exposed analytics identifier → effort asymmetry raises a positive
  MOM-POP indicator, the deception hypothesis rises, and the verdict becomes `undetermined`.
- **Conception scenario:** a synthetic run where inconsistent evidence falls from 30% to 2% across six
  cycles at constant collection volume → conception warning raised, hypothesis set regenerated, ACH
  re-run from scratch, and the ratio series journaled.
- **Baseline scenario (the second headline test):** two unrelated entities behind the same CDN and the
  same image optimizer, producing identical minified-markup quirks and identical re-encode artifacts →
  the processing baseline absorbs both, they are scored as class characteristics of the toolchain, **no
  signature strength is credited**, and no link forms. Removing the baseline gate must make this
  fixture fail, proving the gate is what carries it.
- **Volatility scenario:** a run whose planner would rank a registry lookup above a live-content
  capture on diagnosticity → volatility ordering overrides, the perishable capture runs first, and the
  ordering decision is journaled.
- **Dual-tool scenario:** two independent resolvers disagree on a load-bearing DNS finding → the
  disagreement is recorded as the finding, the conclusion does not rest on either reading, and the
  report shows both.
- **Audience scenario:** content misreading its target community (dated references, mistranslated idiom)
  → recorded at segment level with its alternatives; a fixture attempting to attach the analysis to a
  named individual fails to type-check.
- **Pluralism scenario:** a contested fixture run through Team A/Team B → the two analyses are produced
  without sight of each other, the comparison is the rendered product, and divergence appears in the
  report rather than being resolved; an argument map with an unstated warrant is flagged.
- **Dissent-integrity scenario:** a run whose collection overruns its budget → the dissent pass still
  executes at full reserved budget, and a stubbed narrator attempting to shorten its output fails the test.

## Working style

One conventional commit per phase; stop for approval at each gate. Land P2 before P3–P6 so every
behavioral change is measured against the fixture suite rather than judged by eye. List any dependency
before installing. Final report: the full characteristic classification table with base rates and their
provenance; the measured false-positive rate before and after this task; how the context firewall is
enforced at the type level and the test proving unreachability; the signature feature list with each
one's innocent explanation; the reserved dissent budget and what happens under overrun; the conception
monitor's ratio definition and threshold; which ethics gates you added; and what was deferred
(candidates for `NOTES.md`: expanded known-negative corpora, base-rate measurement from live crawl data,
per-language signature features, inter-rater style agreement metrics for the comparison layer).
