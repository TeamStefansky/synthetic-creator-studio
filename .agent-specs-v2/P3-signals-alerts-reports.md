# Task: Build the signal engine, alerting, and scheduled report generation

## Context
Read `CLAUDE.md` first. P0 delivered the schema, P1 ingestion + dedup, P2 enrichment
(`document_enrichment`, `stance_assessments`) and event clustering (`events`, `event_documents`)
with LLM-written event titles and summaries. `signals/` and `reports/` are still empty.
`event_metrics`, `alerts`, `report_schedules` and `reports` tables exist and are empty.

This phase produces the actual product output an editor consumes: a situational picture (what is
hot, where, and how fast it is moving), negative-coverage tracking, and a scheduled detailed report.

## Objective
An editor configures a report schedule ("every day at 07:00, last 24h, sections: overview, hot
events, trends, negative coverage, geo") and receives a Hebrew report by email and Slack containing:
a ranked list of events with heat scores and trajectory, emerging trends flagged before they peak,
every negative article about the watched entities with evidence, and a geographic hot-zone
breakdown. Separately, a critical alert fires within 10 minutes of an event crossing its threshold.

## Requirements

### Signal engine (`signals/`)
1. `velocity.py` — hourly bucketing per event:
   - `velocity` = documents in the last hour.
   - `acceleration` = z-score of the current hour's count against the event's own trailing 24h mean
     and stdev (Welford, min 6 buckets before a z-score is emitted; before that, `NULL`).
   - `baseline.py` — a per-watchlist seasonal baseline (mean documents per hour-of-week over the
     trailing 4 weeks) so "quiet Saturday" does not read as a spike.
2. `diversity.py` — `source_diversity` = normalized Shannon entropy over the distribution of the
   event's documents across distinct `source_id`, weighted by `sources.tier` (tier-1 counts 2.0,
   tier-2 1.5, tier-3 1.0, tier-4 0.5). Range 0–1.
3. `negativity.py` — `negativity_index` for an event, per entity and aggregate:
   `Σ over documents of (−stance/2) × confidence × prominence × tier_weight` divided by
   `Σ (confidence × prominence × tier_weight)`, clamped to 0–1, computed only over documents with
   `stance < 0`. Also emit `negative_doc_count` and `negative_reach_share` (share of weighted
   coverage that is negative). Documents with `is_opinion = true` are counted separately and
   reported in their own bucket — never blended into the main figure.
4. `geo.py` — hot zones: aggregate documents by `country_code` and by H3 hex (resolution 4) using
   `document_enrichment.geo`. A zone is "hot" when its document count in the last 6h exceeds
   3σ over its trailing 14-day mean. Output `{h3, country_code, lat, lon, doc_count, z, top_event_ids}`.
5. `scoring.py` — composite `heat_score` 0–100:
   `heat = 100 × sigmoid(0.35·norm(acceleration) + 0.25·norm(source_diversity) + 0.20·norm(velocity)
   + 0.10·norm(cross_platform_lift) + 0.10·norm(tier1_share))`.
   `cross_platform_lift` = 1 when an event has documents from ≥2 distinct `source_type` values
   within 6 hours of each other, scaled by how quickly it crossed over. All weights live in
   `signals/weights.py` as a single documented dict — one place to tune.
6. `trends.py` — a **trend** is distinct from an event: a term or entity whose share of watchlist
   documents in the current window is ≥2× its trailing 7-day share, with ≥8 documents and ≥4
   distinct sources. Emit `{term, current_share, baseline_share, lift, doc_count, source_count,
   representative_event_ids, first_detected_at}`. Persist to a new `trends` table
   (migration `0004_trends`).

### Alerting
7. `alerts` rules engine — a small, explicit set (no DSL, no config language):
   - `heat_spike`: heat_score crosses 70 → `warning`; crosses 85 → `critical`.
   - `negative_surge`: `negative_doc_count` for a primary entity ≥5 in 3h AND
     `negativity_index ≥ 0.6` → `critical`.
   - `tier1_pickup`: an event that had no tier-1 source acquires one → `warning`.
   - `new_trend`: a new row in `trends` with `lift ≥ 3` → `info`.
   Each rule has a per-event cooldown (default 6h) to prevent alert storms. Rules live in
   `signals/rules.py` as plain functions returning `Alert | None`.
8. Delivery in `reports/delivery.py`: Slack webhook and SMTP email. Delivery failures are retried
   3× with backoff and then recorded in `alerts.delivery_error` — a failed delivery never crashes
   the pipeline.

### Reports
9. `reports/builder.py` — assembles a `ReportContext` (a Pydantic model) for a watchlist and time
   window WITHOUT any LLM involvement: top events by heat with trajectory arrows, new events since
   last report, trends, negative coverage grouped by entity with evidence spans and links, geo hot
   zones, source breakdown, volume vs. previous period, and the noise stats (documents ingested,
   duplicates collapsed).
10. `reports/renderer.py` — one `claude-sonnet-5` call takes the `ReportContext` (as compact JSON,
    NOT raw article text) and writes the report in **Hebrew** as Markdown. Prompt template in
    `llm/prompts/report.md`. Requirements the prompt must enforce: every factual claim traceable to
    a supplied event/document id; no invented numbers; an executive summary of ≤120 words at the
    top; explicit "what changed since the last report" section; and an explicit statement when a
    section has no data rather than padding. Sections rendered are driven by
    `report_schedules.sections`.
11. HTML rendering with Jinja2 + a clean RTL-aware template; PDF via `weasyprint`. Store markdown,
    html and artifact path on the `reports` row.
12. `tasks/report.py` — Celery beat reads `report_schedules`, evaluates crons in the schedule's
    timezone, generates, renders, delivers, and stamps `last_run_at`. A missed window (worker
    downtime) generates once on recovery, not N times.
13. API routes in `api/routers/`: `GET /watchlists`, `GET /watchlists/{id}/events` (filter by
    status/min heat/time range, sorted by heat), `GET /events/{id}` (with documents and stance),
    `GET /watchlists/{id}/trends`, `GET /watchlists/{id}/geo`, `GET /reports`, `GET /reports/{id}`,
    `POST /reports/generate` (ad-hoc, body: watchlist_id, lookback_hours, sections),
    `GET/POST/PATCH /report-schedules`, `GET /alerts`. All responses Pydantic-typed, paginated
    with limit/offset.

## Technical decisions (follow these — do not re-litigate)
- All metric computation is SQL-first (window functions, `generate_series` for empty buckets),
  with Python only for the final scoring arithmetic. Do not pull raw documents into Python to count them.
- `event_metrics` is written once per event per hourly bucket by a Celery task every 10 minutes
  (upsert on the unique key). Never compute metrics on read.
- Report generation is a single Sonnet call over structured context. Never feed raw article bodies
  to the report model — this is both a cost and a hallucination control.
- Timezone: all scheduling in `Asia/Jerusalem` by default; all storage in UTC.
- Sigmoid, z-score and normalization helpers live in `signals/math.py` with unit tests. No numpy
  gymnastics inline.

## Constraints & non-goals
- No frontend — that is P4.
- No user accounts, permissions, or per-user report preferences.
- No A/B testing of scoring weights, no ML-learned ranking. Weights are hand-set constants.
- Do not add a rules DSL, a workflow engine, or a plugin architecture for alerts.
- Do not modify P1/P2 pipeline code except to append the metrics task to the existing chain.

## Implementation plan
1. `signals/math.py` + `velocity.py` + `baseline.py` + `diversity.py` + tests against a synthetic
   event timeline fixture with a known spike. Verify: the spike hour yields z ≥ 3, quiet hours ≤ 1.
2. `negativity.py` + tests, including the case where an event is overall-negative in tone but the
   monitored entity's stance is positive — `negativity_index` must stay low.
3. `geo.py` + `scoring.py` + `weights.py` + tests.
4. `trends.py` + `trends` table + migration `0004_trends` + tests.
5. `signals/rules.py` + `reports/delivery.py` + cooldown logic + tests (mocked Slack/SMTP).
6. `reports/builder.py` + `ReportContext` schema + tests asserting the context is complete and
   contains zero raw article bodies.
7. `reports/renderer.py` + `llm/prompts/report.md` + Jinja2 HTML + PDF.
8. `tasks/report.py`, beat wiring, missed-window handling.
9. API routers + OpenAPI docs.

## Verification (definition of done)
- `uv run pytest` — all green, all P0–P2 tests still passing.
- `uv run ruff check . && uv run mypy src/` — clean.
- Metric correctness gate: `tests/signals/test_spike_detection.py` on a synthetic 14-day timeline
  with one injected 5× spike detects exactly one spike hour, zero false positives. Do not weaken it.
- Negativity gate: `tests/signals/test_negativity_target.py` — the disaster-article-favorable-entity
  fixture yields `negativity_index < 0.2`.
- End-to-end scenario: `curl -X POST localhost:8000/reports/generate -d '{"watchlist_id":"<demo>",
  "lookback_hours":24,"sections":["overview","hot_events","trends","negative_coverage","geo"]}'`
  returns a report id; `GET /reports/{id}` returns Hebrew Markdown in which every event mentioned
  exists in `event_ids`, and the PDF renders RTL correctly.
- Alert scenario: `uv run python scripts/simulate_spike.py --watchlist demo` injects documents to
  force a heat spike; within one metrics cycle an `alerts` row of severity `critical` exists and a
  Slack payload was dispatched (assert against a local webhook catcher).
- Cooldown scenario: running `simulate_spike.py` twice within an hour produces exactly one alert.
- Hallucination check: `uv run python scripts/report_audit.py --report <id>` verifies every numeric
  figure in the report markdown appears in the source `ReportContext`. It must exit 0.

## Working style
One commit per numbered step, conventional commits. Never weaken a quality gate to make it pass —
if a gate fails, fix the algorithm and say so. Final report must include: the heat scores of the top
5 events from a real run, the alert rules that fired, the Sonnet token cost of one full report, and
any metric you approximated differently from this spec and why.
