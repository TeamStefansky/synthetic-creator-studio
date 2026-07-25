# Task: Case Synthesis v2 — an evidence-grounded forensic case file built to analytic tradecraft

> **This supersedes `truthlens-case-synthesis-prompt.md` (v1).** If v1 was already implemented,
> treat this as the target state and migrate; the additions are marked **[v2]** throughout.
>
> Read `CLAUDE.md` first, then the **Link Board task** and its **server/infrastructure extension**.
> This is the third layer in that chain and an EXTENSION, not a standalone tool. It inherits all of
> their machinery and rules: nodes are domains/infra and **never people**; every edge carries
> evidence + a type-specific alternative; weak signals never sum to "Strong"; CDN/mass-host is
> down-weighted; results are reproducible and rubric-versioned; alerts go through the existing Brand
> Watch pipeline. **Do not rebuild any of that — consume `lib/board/*`.**
>
> **The governing principle:** the Link Board answers "are these two connected?" This layer answers
> "what happened, and in what order?" — and that question has a far more dangerous failure mode.
> **Narrative coherence is not evidence.** A well-written story about twelve loosely related domains
> feels like proof and is not; the more fluent the account, the more persuasive the error. Every
> mechanism below makes the synthesis *adversarial to itself*.
>
> **[v2] The design standard:** this layer implements established forensic and intelligence analytic
> tradecraft in code rather than leaving it to the analyst's memory — chain of custody with content
> integrity, independent source grading, sequencing by timestamp provenance, negative evidence
> distinguished from gaps, likelihood held separate from confidence, hypotheses scored by
> inconsistency, deception carried as a standing hypothesis, and a recorded rung on the
> association → common-operation → attribution ladder that the UI refuses to let language exceed.
> A system that enforces these mechanically is more reliable than an analyst who remembers them,
> because the discipline has to hold on the fortieth case at 3 a.m.

## Context

TruthLens — Next.js `^14.2.35` App Router, TypeScript, Vercel, KV (Upstash/Vercel-KV via
`lib/store.ts`), vitest + Playwright. LLM model from the centralized `LLM_MODEL` constant.

**Existing code this task consumes — read it first, extend rather than replace:**
`lib/board/{orchestrate,links,calibrate,types}.ts`; `lib/clues/{extract,memory}.ts`;
`lib/narrative/{sources,threat,clusters,fingerprints,watch}.ts`; `lib/cib/analyze.ts`;
`lib/similarity/*` (language-agnostic near-duplicate detection, en/he/ru);
`lib/{dns,rdap,ip,ssl,reverseip,fingerprint,http}.ts`; `lib/check/history.ts`; `lib/cache.ts`;
the Save-Page-Now archival helper; the PDF exporter;
`components/{NetworkGraph,ConfidenceBadge,EvidenceList,CibPanel}.tsx`.
Tools whose output becomes case evidence: Site Report, Post Check, Log Analyzer, Email Tracer,
Monitor, Brand Watch.

**Concrete gaps this task closes:**
1. Every tool produces its own result shape; there is no normalized, addressable evidence record,
   so the same fact found by two pipelines is two unrelated rows — losing the corroboration signal
   and double-counting the fact simultaneously.
2. There is no time model. An RDAP creation date and a byline the page prints about itself are
   treated identically, which makes any sequence claim unsafe.
3. **[v2]** There is no content integrity anchor — a source URL proves nothing about what the page
   said when we read it.
4. **[v2]** Nothing grades the *source*, only the artifact type. Six outlets carrying one wire story
   currently look like six independent corroborations.
5. Links are pairwise only; nothing groups them or identifies which single link holds a group together.
6. Nothing states a sequence or direction of spread — the core of "what happened."
7. Nothing distinguishes **"we looked and it isn't there"** from **"we never looked"** — the first is
   evidence, the second is nothing, and conflating them manufactures certainty out of incomplete collection.

ASSUMPTION: no new runtime dependency and no new external data source. All evidence comes from what
the existing pipelines already collect. Graph work (components, articulation points, topological
ordering) is implemented directly in `lib/case/graph.ts` — do not add a graph library.

## Objective

An analyst supplies a board of 2–N entities and receives a **case file**: every fact the system
holds, normalized into one integrity-hashed, source-graded, time-tiered evidence ledger; a timeline
of what appeared when; clusters whose confidence is bounded by their weakest bridging link; a
propagation path showing how a claim moved where — and only where — timestamps justify a direction;
a reconstruction in which **every statement is labeled fact, inference, assumption or speculation
and carries evidence IDs**; a judgment stating likelihood and confidence **separately**; at least
three competing explanations including a null and a deception hypothesis, scored by inconsistency;
a separate register of **negative evidence** and of **gaps**; and a falsification list. Re-running
produces an identical result and a diff against the previous snapshot.

## Requirements

### A. Evidence ledger (`lib/case/ledger.ts`)

1. Define `EvidenceItem`:
   `{ id, entityKey, kind, value, normalizedValue, sourceUrl, archiveUrl?, contentHash,
      acquisitionMethod, collectedAt, enteredCaseAt, eventAt?, eventOffset?, timeTier,
      sourceGrade, infoCredibility, sourceLineage, collector, collectorVersion, state, notes? }`.
   `id` is a deterministic hash of `(kind, entityKey, normalizedValue)` — **note: not including
   sourceUrl** — so the same fact arriving from two sources collapses into one row carrying two
   provenances. Two independent provenances on one row is a corroboration signal and must be
   surfaced as such.
2. **[v2] `contentHash`** is a hash of the retrieved bytes, not the URL, captured at acquisition
   alongside `acquisitionMethod` (transport, auth state, response headers). This is the chain-of-custody
   anchor; without it an exported case cannot answer "was it like that when you found it?"
3. **[v2] Evidence is append-only and never deleted.** Corrections are new records that supersede
   old ones with the supersession recorded. `state ∈ { live, archived-only, lost, superseded }`.
   A ledger that can be silently edited is not a ledger.
4. Write adapters projecting each tool's output into `EvidenceItem[]`, one file per source under
   `lib/case/adapters/`, each pure and unit-tested against a fixture of that tool's real output.
   An adapter never invents a field it cannot source; missing grades are `F6`, never guessed.
5. **Time reliability tiers** — the backbone of the layer:
   - **T1 Authoritative** — RDAP/WHOIS creation date, SSL `notBefore`, CT log entry, platform-native
     publish timestamp from an official API, third-party server logs.
   - **T2 Corroborated** — first archive.org snapshot, our own Save-Page-Now capture, or two
     independent T3 sources agreeing within tolerance.
   - **T3 Claimed** — a timestamp the artifact asserts about itself (byline, JSON-LD `datePublished`,
     `<time>`, EXIF). Self-reported and trivially forged — and forged precisely when it matters.
   - **T4 Observation only** — when *we* first saw it. **Upper bound only, never a lower bound.**
     Encode that asymmetry in the type system, not in a comment.
6. Tolerance windows are named exports in `lib/case/calibrate-time.ts` (T1 ±0, T2 ±24h, T3 ±7d,
   T4 lower-bound-unbounded), versioned as `TIME_RUBRIC_VERSION`.
7. **[v2] Timezone handling:** normalize `eventAt` to UTC for comparison but store `eventOffset`
   separately. The local time an actor operated in is behavioral evidence (working-hours patterns);
   stripping the offset destroys it. Never read an ordering out of a gap smaller than
   `CLOCK_SKEW_TOLERANCE` (named export) between two independent sources.
8. **[v2] Source grading:** `sourceGrade ∈ A–F` (reliability) and `infoCredibility ∈ 1–6`
   (credibility), assigned **independently** per the Admiralty scale in
   `lib/case/grading.ts`. `F6` (cannot be judged) is a valid, common, and expected value — inflating
   an unassessable source to look better is the main abuse of this scale, so make `F6` the default
   and require positive justification to move off it.
9. **[v2] Sourcing independence (`sourceLineage`):** before two items count as corroboration, check
   they do not trace to one origin. Use `lib/similarity/*` to detect syndicated/mirrored content and
   registry-mirror relationships. Items sharing a lineage collapse to a single corroboration weight.
   Six outlets running one wire story is **one** source and must be scored as one.
10. An entity with zero evidence is `NO DATA`, never "clean", never absent — it appears with an
    empty row set and feeds the gaps register.

### B. Timeline (`lib/case/timeline.ts`)

11. Merge the ledger into one chronological sequence with adaptive bucketing (minutes for burst
    windows, days for infrastructure events). Every entry renders its tier badge; tiers are never
    hidden or averaged away.
12. Compute **first observed appearance** per entity and per *claim*, where claim identity comes from
    `lib/similarity/*` clustering — not string equality — so a translated or paraphrased restatement
    is recognized as the same claim.
13. Label these `earliest observed in collected data`. The words `origin`, `source of`, `first`, and
    `patient zero` are banned in all output and enforced by a lint test — the difference is not
    pedantry, it is the difference between a statement about the world and a statement about our
    collection.

### C. Clusters (`lib/case/cluster.ts`, `lib/case/graph.ts`)

14. Connected components over board links with one hard rule: **only Moderate+ edges create or extend
    a component.** Weak edges may display inside an existing component and may never join two. This
    is the single most important guard against the conspiracy wall; implement it as an explicit
    filter with its own test.
15. `clusterConfidence` = **the minimum strength among the component's bridging edges** — the weakest
    load-bearing link. Never the maximum, never a sum, never an average. Many weak indicators raise
    confidence by at most one band and can never produce a category change.
16. Compute **articulation edges** (bridges whose removal splits the component) and surface each as a
    fragility indicator with the evidence it rests on.
17. **[v2] Evidence-level sensitivity:** additionally compute, for each cluster and each path, the
    single **evidence item** whose removal would most degrade it, and display it as
    "this conclusion depends on: X". This is the "would the judgment survive removal of the strongest
    item?" test, computed rather than asked.
18. A component of one entity is a valid result and renders as such.

### D. Propagation path (`lib/case/path.ts`)

19. Directed graph over **claim instances** — `(claimCluster × entity × earliest reliable time)` —
    not over entities. An entity may appear at several points in one path.
20. Draw `A → B` only when **both** hold: (a) both endpoints are **T2 or better**, and B's time
    exceeds A's by more than the wider tolerance *and* more than `CLOCK_SKEW_TOLERANCE`; and (b) a
    content relationship exists — near-duplicate content, quotation, an outbound link, or a shared
    board artifact. When (a) fails, emit an explicit `order not established` edge rendered
    distinctly. Never silently omit the pair — a related-but-unordered pair is a finding.
21. Positional roles from graph position only — `earliest observed instance`, `amplifier`,
    `cross-language bridge`, `terminal` — each carrying the alternative that a genuinely earlier
    instance may exist on a platform never ingested.
22. **Path confidence is capped by coverage**: if the earliest T2+ evidence for a claim is later than
    the earliest T4 observation of a related entity, or any entity in the path lacks archive coverage
    before the path's start, cap at Moderate and state the reason on the path itself.

### E. [v2] Negative evidence, predicted artifacts, and gaps (`lib/case/negative.ts`, `lib/case/gaps.ts`)

23. For each hypothesis (section G), derive the **artifacts it predicts should exist** — a declarative
    table in `lib/case/predictions.ts` mapping hypothesis kind → expected artifact kinds → where they
    would be collected. Run collection for each.
24. A result becomes **negative evidence** only when all four conditions hold, each recorded explicitly
    on the record: (1) a hypothesis specifically predicted the artifact; (2) the search was capable of
    finding it — right source, period, access level, no truncation; (3) the source was reachable and
    complete for the window; (4) it was not found. Negative evidence **counts against** its hypothesis
    in the ACH matrix.
25. If (2) or (3) fail, it is a **gap** and carries **zero** weight in either direction. `NegativeEvidence`
    and `Gap` are two distinct types with different effects on scoring — never one "missing" flag serving
    both. Conflating them is how an investigation manufactures certainty out of its own incompleteness,
    and it is the specific defect this section exists to prevent.
26. The gaps register additionally covers: entities with no RDAP, no archive coverage before the path
    start, unavailable reverse-IP neighbor counts, unresolved `eventAt`, platforms not ingested
    (Telegram/X/Meta remain out of scope), and every adapter that returned nothing. The gaps panel is
    always visible and **never collapsed by default**.

### F. Reconstruction and judgment (`lib/case/narrate.ts`, `lib/case/lexicon.ts`)

27. The LLM receives **only** structured JSON — ledger, timeline, links, clusters, path, negative
    evidence, gaps — each item carrying its evidence ID. No raw page text, no free-form context.
    It returns statements shaped
    `{ text, label, evidenceIds[], likelihood, confidence, rung }` where:
    - **[v2] `label ∈ { FACT, INFERENCE, ASSUMPTION, SPECULATION }`** — the four-label rule, applied
      per sentence, not per section. Most bad analysis is speculation wearing an inference's clothes;
      forcing the label at sentence level makes the swap visible.
    - **[v2] `likelihood`** uses the standard lexicon only: `almost no chance | very unlikely |
      unlikely | roughly even chance | likely | very likely | almost certain`.
    - **[v2] `confidence ∈ { low, moderate, high }`** — a **separate** axis measuring how much the
      sourcing, corroboration and gap picture can bear. `very likely / low confidence` is a valid and
      often correct product. Collapsing the two axes misleads readers in one specific direction —
      toward action — so the schema must make it impossible.
    - **[v2] `rung ∈ { association, common-operation, attribution }`** — the linkage ladder.
28. **Deterministic post-validator**, in code, before storage or display. It drops any statement that:
    has empty `evidenceIds`; references an unknown ID; names a person or account holder; asserts an
    ordering the path layer did not establish; **[v2]** carries a `label` of FACT without a directly
    observed evidence item behind it; **[v2]** uses language above its recorded `rung`; **[v2]** states
    a likelihood without a confidence or vice versa. Log every drop with its reason and show the count
    in the UI ("3 generated statements were removed for lacking evidence") — never hide the filtering.
29. **[v2] The rung enforcement is the load-bearing ethics control.** Verbs of agency — coordinated,
    directed, funded, controlled, orchestrated, operated by — are `attribution`-rung only, and the
    `attribution` rung additionally requires a completed deception assessment (req. 34) or it is
    rejected outright. At `association`, the permitted verbs are exactly: shares, is hosted alongside,
    published identical content to. The lexicon lives in `lib/case/lexicon.ts` and drift up the ladder
    between the evidence section and the summary — the way a defensible report becomes an indefensible
    headline — must be impossible by construction.
30. **[v2] Banned regardless of rung:** "sources indicate", "it is widely believed", "reports suggest",
    bare "possible/may/could" used as a likelihood, and any percentage stated alongside a lexicon term.
31. Determinism: temperature 0, prompt content hashed as `NARRATIVE_PROMPT_VERSION`, result cached by
    `(ledgerHash, BOARD_RUBRIC_VERSION, TIME_RUBRIC_VERSION, GRADING_VERSION, NARRATIVE_PROMPT_VERSION)`.
32. If validation removes more than half the generated statements, publish no reconstruction — render
    "the evidence does not support a connected account" plus the ledger and timeline. A shredded
    narrative is a signal, not something to paper over.

### G. [v2] Hypotheses, assumptions, and deception (`lib/case/hypotheses.ts`, `lib/case/assumptions.ts`)

33. **ACH matrix**: ≥3 hypotheses × every diagnostic evidence item and every negative-evidence item,
    each cell `consistent | inconsistent | neutral`, scored by asking *"how likely is this evidence if
    this hypothesis were true?"* — not "does this fit?". Two hypotheses are **always** present and
    never scored more harshly than the others:
    - the **null**: unrelated operators, commodity shared infrastructure, coincidence, organic spread;
    - **[v2]** the **deception hypothesis**: the artifacts were left to be found. For an
      influence-operations tool this is not an exotic case — a shared analytics ID, a convenient
      language artifact, or an exposed directory is equally consistent with sloppiness and with a
      false flag.
34. **[v2] Deception is scored, not asserted.** Implement MOM (motive, opportunity, means), POP (past
    practices), MOSES (vulnerability of our own sources to being fed) and EVE (accuracy, internal
    consistency, **convenience**, custody) as an explicit checklist in `lib/case/deception.ts`.
    Deception outranks a simpler hypothesis only with positive MOM-POP indicators — otherwise it is
    unfalsifiable, absorbs every contradiction, and quietly destroys the analysis it was meant to
    protect. Evidence that arrives unusually easily or points unusually neatly is weighted **down**.
35. Rank by **fewest inconsistencies**, never most confirmations — ACH eliminates, it does not confirm.
    A hypothesis consistent with everything is usually just vague. If the top two are within
    `ACH_TIE_THRESHOLD` (named export), the verdict is **undetermined**, rendered at the top of the wall.
36. Mark **diagnostic** evidence — items that discriminate between hypotheses — and visually
    de-emphasize non-diagnostic items everywhere. A wall covered in impressive but non-discriminating
    string is precisely the artifact this layer exists to prevent.
37. **[v2] Key Assumptions Check** (`assumptions.ts`): extract every assumption the case rests on,
    each with its own confidence and a load-bearing flag. An assumption that is **load-bearing and
    low-confidence is the most important finding in the case** and renders in the summary, not an
    appendix — most analytic surprises are not new evidence, they are an old assumption failing.
38. **[v2] Post-hypothesis collection flag:** using `enteredCaseAt`, mark evidence that entered the
    case after its supporting hypothesis was formed, and show the marking in the matrix. Evidence
    gathered through a theory was gathered *for* it.
39. **Falsification list**: specific, collectable evidence that would break the leading hypothesis.
    Rendered beside the reconstruction, never in an appendix, and doubling as the collection plan.
    **A case whose falsification list is empty fails validation** — a conclusion nothing could
    disprove is a belief, not a finding.

### H. Persistence and alerts

40. Immutable case snapshot in KV (`case:{scope}:{id}`) with all rubric, grading and prompt versions
    embedded. Re-running creates a new snapshot and a **diff**: evidence added/superseded, links
    changed strength, clusters merged/split, path edges gained or lost, hypothesis ranking flips,
    assumption confidence changes. The diff is a first-class view.
41. Alert only on: new Moderate+ cluster membership, articulation edge collapse, hypothesis-lead flip,
    **[v2]** a load-bearing assumption failing. Route through the existing Brand Watch
    alert/dedup/cooldown/triage pipeline with fingerprint `(caseId, changeKind, subjectKey)`.
    Do not build a second alerting system.
42. Case memory is scoped per user/workspace exactly as clue memory is. Never global. Anonymous mode
    stays local-only.

### I. The wall (`app/case/`, `components/CaseWall.tsx`)

43. Four synchronized views sharing selection state:
    - **Wall** — entity cards positioned by cluster, strings styled by strength (Strong solid,
      Moderate dashed, Weak dotted behind a toggle), articulation edges flagged, cluster regions
      labeled with bounded confidence and their recorded **rung**.
    - **Timeline** — a lane per entity, evidence pins with tier badges, path arrows,
      `order not established` pairs drawn distinctly.
    - **Ledger** — sortable table plus the full source appendix (artifact, source URL, acquisition
      method, **content hash**, retrieval time, archive link, **source grade**, collector version).
    - **[v2] Analysis** — the ACH matrix with diagnostic rows highlighted and post-hypothesis items
      marked, the deception checklist, the Key Assumptions Check, the falsification list, and the
      **two separate registers**: negative evidence and gaps, never merged.
44. Reconstruction panel with **inline citation chips** and a visible label badge per statement
    (FACT/INFERENCE/ASSUMPTION/SPECULATION); clicking a chip highlights that evidence simultaneously
    on the wall and the timeline. This cross-highlight is the core interaction — it lets an analyst
    check a claim in one click instead of trusting prose.
45. **[v2]** Every judgment renders likelihood and confidence as two distinct visual elements. The UI
    must make it impossible to read one as the other.
46. Export: PDF and JSON, both carrying the source appendix with hashes and grades, the negative
    evidence register, the gaps register, the ACH matrix, the assumptions, the falsification list, and
    every version stamp. An exported case omitting its gaps or its falsification list is a defect.
47. Match the existing design system. Do not restyle other tools.

## Technical decisions (follow these — do not re-litigate)

- New code: `lib/case/{ledger,timeline,cluster,graph,path,narrate,lexicon,hypotheses,deception,
  assumptions,negative,predictions,grading,gaps,diff,calibrate-time,types}.ts` plus
  `lib/case/adapters/*`, `app/api/case/route.ts`, `app/case/`, and the components above. Do not
  scatter case logic into existing tool files.
- All thresholds, tolerance windows, tie thresholds, band lexicons, grading tables and role rules are
  **named exports** in the module that owns them — never inline literals — and every one is covered by
  a version stamp stored on each snapshot (`GRADING_VERSION` is new in v2).
- Graph algorithms (connected components, articulation points via DFS lowlink, topological ordering)
  are pure functions in `lib/case/graph.ts` with unit tests. No graph dependency.
- The LLM is used for exactly two things: claim clustering (through the existing similarity interface)
  and statement generation. **Every structural decision — clustering, direction, confidence, grading,
  ranking, deception scoring — is computed in TypeScript and reproducible without the model.**
- Reuse `lib/cache.ts` for adapter results keyed by `(entityKey, tool, day)`; building the ledger must
  not re-run collection.
- Determinism is a tested property: identical evidence + identical versions → byte-identical case JSON
  apart from the snapshot timestamp.

## Constraints & non-goals

- FROZEN: `CLAUDE.md`; disclaimers; `tests/ethics.test.ts` (add gates, never loosen); the rule that
  the influence/CIB graph never contains person nodes.
- **Never:** a person node, named individual, or account-holder identity anywhere in a case, the
  reconstruction included; an ownership/control/coordination/funding/state-attribution claim without a
  recorded `attribution` rung *and* a completed deception assessment; a statement without a valid
  evidence ID; a FACT label without directly observed evidence; a directional claim from T3/T4
  timestamps; a cluster formed by weak edges; deletion of an evidence record; a gap counted as
  negative evidence; the words "origin"/"source of"/"patient zero" in output; scraping or unofficial
  sources; automated action against any domain or account.
- Out of scope: new platform ingestion (Telegram/X/Meta), actor attribution fields, per-individual
  profiling, real-time streaming claims, takedown workflows. Note deferrals in `NOTES.md`.
- Do not break the six existing tools; regression-check after every phase.
- No new runtime dependency without listing it and stopping for approval first.

## Implementation plan (stop-gate at the end of each phase)

**P0 — Discovery + characterization (no production edits).** Read `CLAUDE.md`, `NOTES.md`,
`lib/board/*`, `lib/clues/*`, `lib/narrative/*`, `lib/similarity/*`, `tests/*`. Capture each tool's
real output shape as fixtures. Write failing tests stating the target behavior: a T4-only pair yields
`order not established`; weak edges do not join components; **[v2]** a gap must not score in the ACH
matrix; **[v2]** a statement labeled FACT without observed evidence is rejected. Report the plan; stop.

**P1 — Ledger, custody, grading, time.** `types.ts`, `ledger.ts`, `grading.ts`, `calibrate-time.ts`,
all adapters. Verify: per-adapter unit tests; deterministic-ID dedup test (same fact from two tools →
one row, two provenances, one corroboration weight); **[v2]** content-hash capture and re-verification
test; **[v2]** syndication test — one wire story across six outlets scores as one source;
**[v2]** `F6` is the default grade and requires justification to change; tier assignment table test;
UTC-with-offset preservation test; `npx tsc --noEmit`.

**P2 — Timeline + claim identity.** `timeline.ts` over `lib/similarity`. Verify: Hebrew and Russian
restatements of one English claim land in one claim cluster; a genuine-breaking-news fixture produces
no false coordination signal; clock-skew test — a 40-second gap between independent sources yields no
ordering; banned-vocabulary lint green.

**P3 — Graph, clusters, path, sensitivity.** `graph.ts`, `cluster.ts`, `path.ts`. Verify:
weakest-load-bearing-link confidence; articulation-edge detection on a hand-built fixture; the
direction matrix (T1↔T1, T2↔T2, T2↔T3, T4↔T4) producing the specified outcomes; coverage cap applied;
**[v2]** evidence-level sensitivity identifies the correct single item on a fixture where one artifact
carries the cluster.

**P4 — Predictions, negative evidence, gaps.** `predictions.ts`, `negative.ts`, `gaps.ts`. Verify:
**[v2]** the four-condition test — a truncated search yields a Gap and scores zero, while an adequate
search yields NegativeEvidence and scores against its hypothesis; the two types are never
interchangeable in the scorer.

**P5 — Hypotheses, deception, assumptions.** `hypotheses.ts`, `deception.ts`, `assumptions.ts`.
Verify: null and deception hypotheses always present; **[v2]** deception without positive MOM-POP
indicators never outranks a simpler hypothesis; an ambiguous fixture returns `undetermined`; a
load-bearing low-confidence assumption surfaces in the summary; post-hypothesis evidence is flagged;
an empty falsification list fails validation.

**P6 — Reconstruction, validator, lexicon.** `narrate.ts`, `lexicon.ts`. Verify: adversarial fixture —
an LLM response containing an uncited statement, a named person, an ownership assertion at
`association` rung, a FACT label with no observed evidence, a likelihood without a confidence, and an
unestablished ordering has **all six** removed and counted; the >50% shred path renders the
no-reconstruction state; determinism test.

**P7 — Wall UI, diff, alerts, export.** Four views, cross-highlight, label badges, dual
likelihood/confidence rendering, `diff.ts`, Brand Watch wiring, PDF/JSON export. Verify:
`npm run e2e`; manual — build a case from 3 related and 2 unrelated entities and confirm the unrelated
pair forms no cluster, the gaps and negative-evidence registers are separately visible without
interaction, and a citation chip highlights the right pin on both other views.

## Verification (definition of done)

- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run e2e` — all green.
- **Ethics gates (new tests):** no person node or named individual anywhere, reconstruction included;
  no ownership/control/coordination/attribution claim without a recorded `attribution` rung and a
  completed deception assessment; every statement has ≥1 valid evidence ID and a label; band and rung
  lexicon violations are rewritten or dropped; weak-only evidence never produces a cluster or a Strong
  case; a T3/T4 pair never yields a direction; banned vocabulary never appears; a gap never scores as
  negative evidence; no evidence record is ever deleted; the falsification list is non-empty; case
  memory is scope-isolated; zero evidence renders "no case established".
- **Headline calibration scenario:** five entities where two share a Google Analytics ID, two more
  share only a mass-hosting IP and a registrar, and one is unrelated → exactly **one** Moderate+
  cluster (the GA pair) at `association` rung, the mass-hosting pair produces a Weak edge joining
  nothing, the unrelated entity stands alone, and the reconstruction does not tie them into one story.
- **Direction scenario:** entity A with an RDAP creation date (T1), entity B whose only timestamp is
  our crawl time (T4), sharing near-duplicate content → a content relationship with
  `order not established` and no arrow in either direction.
- **[v2] Syndication scenario:** the same claim published by six outlets, all traceable to one wire
  service → one corroboration weight, not six, and the ACH matrix treats it as a single item.
- **[v2] Negative-evidence scenario:** hypothesis H predicts a shared AdSense ID. Run 1 searches
  adequately and finds none → NegativeEvidence, scoring against H. Run 2 is truncated by rate limit →
  Gap, scoring zero, and H's ranking is unchanged from before the run.
- **[v2] Deception scenario:** a case whose only strong artifact is a shared analytics ID, with no
  MOM-POP indicators present → the deception hypothesis is listed and scored but does not outrank the
  null; with capability and past-practice indicators supplied, it rises and the verdict becomes
  `undetermined`.
- **[v2] Ladder scenario:** an LLM statement reading "the two sites are operated by the same group"
  attached to a cluster recorded at `association` rung → rejected by the validator, drop reason
  logged and surfaced, and the published text uses the association-rung verb instead.
- **Shred scenario:** a stubbed LLM response of six statements, four uncited → all four removed, the
  count shown, and the no-reconstruction state rendered.
- **Diff scenario:** run a case, add one Strong artifact, re-run → exactly one added link and, if
  cluster membership changes, exactly one deduped alert.

## Working style

One conventional commit per phase; stop for approval at each gate. List any dependency before
installing. Final report: the time-tier table as implemented (tier → sources → tolerance → what it may
and may not prove); the grading defaults and how `F6` is preserved against inflation; how sourcing
independence is computed; how weak-edge cluster formation is blocked and which test proves it; the
full list of validator drop reasons with the tests covering each; how the rung ladder is enforced end
to end; the NegativeEvidence-vs-Gap scoring separation and its test; which ethics gates you added; and
what was deferred (candidates for `NOTES.md`: passive-DNS history, WHOIS history, screenshot
perceptual hashing, analyst-authored hypotheses, multi-analyst case collaboration).


