# Task: Build Full Coverage — story angles, multi-language framing analysis, and the coverage view

## Context
Read `CLAUDE.md` first, including the `## Sources & rights` and `## Reader product` sections.
P0–P4 built the monitoring system. P5 added sources, batch onboarding, content-rights tiers and
keyword+country interests. P6 added English translation, immutable editions, the headline digest and
share links. P7 built the English reader site, including a chronological coverage timeline on the
story page.

This phase adds the feature that separates a real news aggregator from a link list: **Full Coverage**
— not "here are 40 articles about the same thing", but "here is the story, and here are the
different angles it is being told from, by whom, in which languages, from which countries."

The comparative angle is the differentiator over Google News: because P2 already stores per-document
geo, language, source country and entity-targeted stance, the system can show how the same event is
framed differently across languages and regions. Nobody else in the reader's workflow can do that.

ASSUMPTION: Full Coverage applies only to event-backed stories with `source_count >= 4`. Below that
there is nothing meaningful to compare and the existing chronological timeline is correct.

## Objective
On a story with broad coverage, the reader sees: how many sources, countries and languages covered
it; a timeline of who published first and how it spread; the story broken into 2–5 distinct
**angles** with the sources grouped under each; and a short comparative note on what different
language and regional presses emphasize. Every claim in that analysis is traceable to specific
documents, and every source in it links out to its original.

## Requirements

### Angle detection
1. New table `story_angles` (migration `0007_full_coverage`): `id`, `event_id` fk cascade,
   `label` text (≤60 chars, English), `description` text (1–2 sentences), `document_count`,
   `source_countries` char2[], `langs` text[], `centroid` vector(1024), `share` float,
   `generated_at`, `model`. Plus `angle_documents` (`angle_id` fk cascade, `document_id` fk cascade,
   `similarity` float, composite pk).
2. `coverage/angles.py` — two-stage, cheap first:
   - **Stage A (no LLM):** sub-cluster the event's documents by embedding using agglomerative
     clustering with a cosine distance threshold of 0.25, minimum 2 documents per angle, maximum 5
     angles. Documents that do not join a cluster go to a residual bucket and are not shown as an
     angle. Seed the clustering with the `framing` strings already stored in
     `stance_assessments` when present — identical framings force co-assignment.
   - **Stage B (one LLM call per event):** send the sub-cluster structure to `claude-sonnet-5` —
     for each sub-cluster, its 3 most central headlines plus their source name, country and
     language — and get back an English `label` and `description` per angle, in
     `AnglesOut` (`llm/schemas.py`). The model **labels** the clusters; it does not create,
     merge or reassign them. State that constraint explicitly in `llm/prompts/angles.md`.
   - Recompute an event's angles when its `doc_count` grows ≥40% since `generated_at`, and never
     more than once per hour per event.
3. Prompt requirements for `llm/prompts/angles.md`: labels must be neutral and descriptive
   ("Economic impact", "Legal challenge", "Military response") — never evaluative, never a headline,
   never a slogan. The description states what this group of coverage focuses on, in the system's
   own words, without quoting any source beyond 10 consecutive words.

### Coverage statistics
4. `coverage/stats.py` — for an event, compute and cache in a new `event_coverage` table
   (`event_id` pk, `source_count`, `country_count`, `lang_count`, `first_published_at`,
   `first_source_id`, `peak_hour`, `by_country` jsonb, `by_lang` jsonb, `by_tier` jsonb,
   `stance_by_lang` jsonb, `stance_by_country` jsonb, `computed_at`):
   - `by_country` / `by_lang` / `by_tier`: `{key: {doc_count, source_count, first_at}}`.
   - `stance_by_lang` / `stance_by_country`: mean entity stance and negative share per group,
     computed only over documents with a `stance_assessments` row and **only when that group has
     ≥3 documents from ≥2 distinct sources**. Groups below that threshold are omitted entirely
     rather than reported with a weak number — a single article is not a national press position.
   - `first_source_id`: earliest `published_at` among non-duplicate documents. Surface it as
     "first reported by" only when the gap to the second source is ≥15 minutes; otherwise omit.

### Comparative framing note
5. `coverage/comparison.py` — one `claude-sonnet-5` call per event, only when the event has
   coverage in **≥3 languages or ≥4 countries**, producing `ComparisonOut`:
   `{summary: str, observations: [{group_type: 'lang'|'country', group_key: str, emphasis: str,
   supporting_document_ids: [uuid]}]}`.
   - Input is the angle structure plus, per language/country group with ≥3 documents, that group's
     translated headlines and framing labels. **Never the article bodies.**
   - `llm/prompts/comparison.md` must require: every observation cites at least 2
     `supporting_document_ids` drawn from the supplied set; no claim about a group that was not
     supplied; descriptive language about *what is emphasized*, never about motive, bias or
     credibility of any outlet or country; and an explicit statement when coverage is too uniform to
     compare rather than manufacturing a contrast.
   - Store in a new `event_comparisons` table (`event_id` pk, `summary`, `observations` jsonb,
     `model`, `generated_at`).
   - **Validation before persisting:** drop any observation whose `supporting_document_ids` are not
     all present in the input set or which cites fewer than 2. If more than half the observations
     are dropped, discard the whole comparison and log `comparison.rejected` rather than storing a
     partial one.

### API
6. Extend `GET /site/story/event/{id}` with a `coverage` object:
   `{stats: {...}, angles: [{label, description, document_count, share, source_countries, langs,
   sources: [StoryOut-lite]}], comparison: {summary, observations} | null,
   timeline: [{source_name, source_country, lang, published_at, url, angle_label}]}`.
   All source entries go through `site/serializers.py::to_story_out` — no exception for this route.
7. `GET /site/story/event/{id}/coverage?group_by=country|lang|angle|tier` returns the grouped source
   lists on their own for the UI's grouping control.
8. Celery: `compute_coverage(event_id)` runs after clustering for any event crossing
   `source_count >= 4`, throttled to once per hour per event, and is skipped entirely when the LLM
   daily budget guard from P2 is tripped (stats still compute — they cost nothing).

### UI (in `web/`, reader surface)
9. On `/site/story/event/[id]`, below the article header, a **Full Coverage** section, only rendered
   when `coverage.stats.source_count >= 4`:
   - A stat strip: `N sources · M countries · K languages · first reported by {source} at {time}`.
   - A grouping control: **By angle** (default) / **By country** / **By language** / **By source tier**.
   - By angle: one collapsible block per angle with its label, description, share bar, and the
     source list (each row: favicon, source name, country flag, publish time, translated headline,
     outbound link).
   - By country/language: same rows grouped, with a small horizontal bar showing each group's share
     of coverage.
   - A spread timeline: a compact horizontal chart of publications over time, dots colored by angle,
     with the first publication marked.
   - The comparison note rendered as a short paragraph plus its observations, each observation
     showing its supporting sources as inline chips that scroll to those rows. Prefix the block with
     a plain-language label: `How coverage differs` and a one-line disclosure that this is an
     automated comparison of headlines, with a link to the sources it used.
10. When `comparison` is null, render nothing for it — no placeholder, no "not enough data" box.
11. Front page: an event card whose event has ≥4 sources and ≥2 countries shows a
    `Full coverage · N sources` chip that deep-links to the coverage section anchor.

## Technical decisions (follow these — do not re-litigate)
- Embeddings do the clustering; the LLM only labels and compares. Any design where the model
  decides which articles belong together is wrong — it does not scale and it is not reproducible.
- Cost ceiling: at most 2 Sonnet calls per event per hour (angles + comparison), and only for events
  above the coverage thresholds. Everything else is SQL and vector math.
- Never quote more than 10 consecutive words from any source in a label, description or observation.
  Enforce with a post-generation check in `coverage/validate.py` that scans generated text against
  the input headlines and rejects the output on violation.
- The comparison describes *emphasis*, never bias, motive or credibility. This is a newsroom product;
  an automated claim that "Russian media is biased" is a liability, not a feature.
- Groups below 3 documents / 2 sources are omitted, never shown with a caveat.

## Constraints & non-goals
- No sentiment scoring of outlets or countries as entities. No "trust score" per country.
- No user-facing controls to tune thresholds. No angle editing.
- No new clustering path — reuse `events` from P2 and its embeddings.
- No changes to the monitoring dashboard, the digest, or share-link behavior beyond the coverage
  object appearing in the story payload that `/p/` routes already serve.
- Do not modify `site/serializers.py`'s rights enforcement. Extend it only by adding the coverage
  object built from already-serialized story entries.

## Implementation plan
1. Migration `0007_full_coverage`: `story_angles`, `angle_documents`, `event_coverage`,
   `event_comparisons`. Verify: up/down/up clean, full existing suite green.
2. `coverage/stats.py` + tests on a fixture event with 30 documents across 6 countries and 4
   languages — assert group thresholds are respected and under-threshold groups are absent.
3. `coverage/angles.py` Stage A (sub-clustering) + tests on a fixture event with 3 known angles —
   assert 3 clusters with ≥85% purity.
4. Stage B labelling + `llm/prompts/angles.md` + `coverage/validate.py` quote check.
5. `coverage/comparison.py` + `llm/prompts/comparison.md` + the citation-validation and rejection logic.
6. Celery wiring, throttling, budget-guard skip.
7. API: extended story payload + the `group_by` route.
8. UI: Full Coverage section, grouping control, spread timeline, comparison block, front-page chip.

## Verification (definition of done)
- `uv run pytest` and `cd web && npm run build && npm run lint && npm run test && npx tsc --noEmit`
  — all clean. **Every P0–P7 test passes unmodified.**
- **Angle purity gate:** `tests/coverage/test_angles.py` on the 3-angle fixture yields 3 angles with
  ≥0.85 purity and no more than 5 angles on any fixture. Do not weaken it.
- **Citation gate:** `tests/coverage/test_comparison_citations.py` — a mocked model response whose
  observations cite document ids absent from the input has those observations dropped; a response
  where most observations are invalid results in no stored comparison.
- **Quote gate:** `tests/coverage/test_quote_limit.py` — a mocked label containing 15 consecutive
  words from an input headline is rejected.
- **Threshold gate:** an event with coverage in 2 languages produces `comparison = null`; an event
  where one country has 2 documents omits that country from `stance_by_country`.
- **Rights gate (regression):** `tests/site/test_no_fulltext_leak.py` still passes with the coverage
  object present in the payload — no source text beyond the tier cap appears anywhere inside it.
- **Cost gate:** `scripts/cost_report.py --hours 24` shows at most 2 Sonnet calls per qualifying
  event per hour.
- End-to-end scenario: seed an event with 30 documents from 12 sources across 6 countries and 4
  languages, run `compute_coverage`, then open `/site/story/event/{id}`:
  1. The stat strip shows correct source/country/language counts and a "first reported by" line.
  2. By angle shows 2–5 labelled groups, each with its sources and outbound links.
  3. Switching to By country and By language regroups the same source rows with share bars.
  4. The comparison paragraph appears with observations whose source chips scroll to real rows.
  5. Every source row links to an external domain; no article body is visible anywhere.
- Uniform-coverage scenario: an event where all 12 sources say the same thing produces either one
  angle or a comparison stating coverage is uniform — never a fabricated contrast.

## Working style
One commit per numbered step, conventional commits. Append a `## Full Coverage` section (≤15 lines)
to `CLAUDE.md`: embeddings cluster, the LLM only labels; comparisons describe emphasis not bias;
groups below 3 docs / 2 sources are omitted; every observation must cite ≥2 documents from the input
set or it is dropped. Final report: angle counts per fixture event, comparison rejection rate,
Sonnet cost per event, and any event where the comparison was discarded and why.
