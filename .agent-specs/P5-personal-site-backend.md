# Task: Build the personalization layer — my feeds, my topics, editions, and a daily digest

## Context
Read `CLAUDE.md` first. NewsRadar currently works as a monitoring system: P0 schema, P1 ingestion
(GDELT/RSS/Telegram/YouTube/Perigon → deduplicated `documents` + `document_matches`), P2 enrichment
(embeddings, entities, geo, entity-targeted stance) and event clustering, P3 signal engine
(heat, trends, geo hot zones), alerting and scheduled analyst reports, P4 the editor dashboard.

This phase adds a second product surface on top of the same pipeline: a **personal news site**. The
user curates their own RSS feeds and declares the topics that matter to them; the system publishes a
periodically-refreshed, ranked front page from those sources, and emails them one detailed daily
digest. The analyst monitoring product is unchanged and must keep working.

ASSUMPTION: single user (the newsroom editor who owns this deployment). "Personalization" means one
profile, not per-user profiles. Do not build a users table.
ASSUMPTION: the personal site is served to a small internal audience behind the newsroom VPN, but
it republishes third-party content — so the licensing rules below are hard requirements, not
defensive coding.

## Objective
The user imports an OPML file or pastes site URLs, gets working RSS subscriptions, defines topics in
plain language ("בינה מלאכותית ורגולציה", "שוק הנדל״ן בישראל"), and within one ingestion cycle
`GET /site/edition/current` returns a ranked, deduplicated, source-diverse front page built only
from their chosen feeds and topics. Every morning at 07:00 Asia/Jerusalem they receive a Hebrew
daily digest email covering the last 24h, downloadable as PDF/Markdown.

## Requirements

### Feed curation
1. `feeds/discovery.py`: `discover_feeds(url) -> list[DiscoveredFeed]` — given any site URL, find its
   RSS/Atom feeds via `<link rel="alternate">`, then common paths (`/feed`, `/rss`, `/rss.xml`,
   `/atom.xml`, `/feed/`, `/index.xml`). Return `{feed_url, title, site_title, item_count,
   last_published_at, detected_lang}` by fetching and parsing the feed once. Never crawl beyond the
   given host.
2. `feeds/opml.py`: import and export OPML 2.0, preserving folder names as tags.
3. New table `feed_subscriptions` (migration `0005_personalization`): `id`, `source_id` fk `sources`,
   `feed_url` unique, `title`, `tags` text[], `poll_interval_seconds` int default 600,
   `active` bool, `last_polled_at`, `last_ok_at`, `consecutive_failures` int default 0,
   `etag` text nullable, `last_modified` text nullable, `created_at`.
   Adding a subscription creates or reuses a `sources` row (matched on domain) with
   `allows_fulltext_storage = false` by default.
4. Extend `connectors/rss.py` to poll `feed_subscriptions` in addition to `config/feeds.yaml`.
   Send conditional requests using stored `etag` / `If-Modified-Since` and store the response
   values. A feed with `consecutive_failures >= 10` is auto-deactivated and surfaced in the API.

### Topics
5. Add `watchlists.kind` enum (`monitoring | interest`), default `monitoring`. A **topic** is a
   `watchlists` row with `kind = 'interest'`. Reuse `watchlist_terms` for keywords. Do NOT create a
   parallel topic model.
6. Add `watchlists.description_embedding vector(1024)` and `watchlists.min_semantic_similarity`
   float default 0.78. When a topic is created or its description changes, embed
   `"query: " + description` with the same `multilingual-e5-large` model and store it.
7. `pipeline/matcher.py` gains **hybrid matching** for `kind='interest'` watchlists: a document
   matches if the existing keyword/boolean matcher fires **or** cosine similarity between the
   document embedding and `description_embedding` ≥ `min_semantic_similarity`. Record which path
   fired in `document_matches.matched_terms` (use the sentinel `__semantic__`) and set
   `match_score` accordingly (keyword hits score higher than a semantic-only match).
   Keyword-only matching for `kind='monitoring'` watchlists must be byte-for-byte unchanged.

### Ranking and editions
8. `site/ranking.py` — `personal_score` for a candidate story, 0–100:
   ```
   score = 100 * sigmoid(
       0.30 * topic_affinity      # max match_score across the user's topics
     + 0.25 * recency             # exp decay, half-life = EDITION_RECENCY_HALFLIFE_HOURS (default 8)
     + 0.20 * corroboration       # normalized source_count of the story's event
     + 0.15 * source_trust        # sources.tier + credibility_score
     + 0.10 * heat                # existing events.heat_score, 0 for singletons
   )
   ```
   Weights live in `site/weights.py` as one documented dict.
9. `site/edition.py` — builds an **edition**: an immutable snapshot of the front page.
   - A **story** is an `events` row when `source_count >= 2`, otherwise a standalone canonical
     `documents` row. Never both — a document already inside an event is never emitted separately.
   - Candidate pool: documents from `feed_subscriptions` sources plus documents matching any
     `kind='interest'` watchlist, published within `lookback_hours` (default 36), excluding
     `dedup_of IS NOT NULL`.
   - **Diversity constraints, enforced at selection time:** no two items from the same event;
     no source contributes more than 30% of the edition; each topic gets at least 2 slots if it has
     any qualifying candidate; the remainder is filled by global `personal_score`.
   - Sections: one per topic, ordered by the topic's aggregate score, plus a `top` section of the
     10 highest-scoring items overall.
   - New tables: `editions` (`id`, `generated_at`, `lookback_hours`, `item_count`, `config_snapshot`
     jsonb) and `edition_items` (`edition_id` fk cascade, `position` int, `section` text,
     `story_type` enum `event|document`, `event_id` nullable fk, `document_id` nullable fk,
     `personal_score` float, `reason` text — a short human-readable "why this is here", e.g.
     `נושא: רגולציית AI · 7 מקורות · לפני שעתיים`. Composite pk (`edition_id`,`position`).
     CHECK constraint: exactly one of `event_id`/`document_id` is non-null.)
   - Celery beat task `build_edition` every `EDITION_INTERVAL_MINUTES` (default 30). Editions are
     never mutated after creation; `current` = most recent.
10. `site/blurb.py` — for the top 15 items of an edition only, generate a 1–2 sentence Hebrew blurb
    with `claude-haiku-4-5-20251001` from the title + stored extract. Reuse the event summary from
    P2 when the story is an event with a summary. Store on `edition_items.blurb`. Never call the LLM
    for the long tail.

### Daily digest
11. Extend `report_schedules` with `report_type` enum (`analyst | daily_digest`), default `analyst`,
    and `reports` likewise. Existing analyst reports keep working unchanged.
12. `reports/digest_builder.py` — assembles a `DigestContext` from the last 24h WITHOUT the LLM:
    top stories per topic with links and extracts, what's new vs. yesterday's digest, the 3 fastest-
    rising topics (reuse `signals/trends.py`), stories the user's feeds covered that tier-1 global
    sources did not (a "your feeds got there first" section), volume stats, and any subscription
    that failed to poll.
13. `reports/digest_renderer.py` — one `claude-sonnet-5` call over `DigestContext` producing Hebrew
    Markdown. Prompt in `llm/prompts/daily_digest.md`. It must: open with a ≤100-word summary of the
    day, group by topic, link every item to its original URL with the source name, never invent a
    fact or number absent from the context, and state plainly when a topic had nothing.
14. Delivery reuses `reports/delivery.py` (email + Slack). PDF via the existing weasyprint path with
    the RTL template. Default schedule seeded: `0 7 * * *`, `Asia/Jerusalem`, `daily_digest`.

### API
15. New router `api/routers/site.py`:
    `GET /site/edition/current`, `GET /site/editions`, `GET /site/editions/{id}`,
    `GET /site/story/{story_type}/{id}` (item detail: extract, source, published_at, related items
    in the same event), `POST /site/refresh` (force `build_edition`).
16. New router `api/routers/curation.py`:
    `GET/POST/DELETE /feeds`, `POST /feeds/discover` (body: `{url}`), `POST /feeds/import-opml`
    (multipart), `GET /feeds/export-opml`, `PATCH /feeds/{id}` (activate/deactivate, tags),
    `GET /feeds/health` (per-feed last_ok_at, consecutive_failures),
    `GET/POST/PATCH/DELETE /topics` (topics = `kind='interest'` watchlists; POST accepts
    `{name, description, keywords[], lang_filter?}` and triggers the description embedding).

## Technical decisions (follow these — do not re-litigate)
- **Licensing is a hard constraint.** The site API returns, per item: title, source name, source
  link, published_at, an extract of **at most 400 characters** taken from `documents.summary`, and
  the LLM blurb. It NEVER returns `documents.body`, and it never returns an extract at all when
  `sources.allows_fulltext_storage = false` and the extract would exceed 400 chars. Every item
  links out to the original. Enforce this in a single serializer function
  (`site/serializers.py::to_story_out`) that all site routes go through — not in each route.
- Editions are immutable snapshots, not live queries. This is what makes the front page stable
  while the user reads it, and makes the daily digest reproducible.
- Ranking is deterministic given the same inputs and clock. No randomness, no exploration bandit.
- Reuse `events` from P2 for corroboration and dedup. Do not build a second clustering path.
- Semantic topic matching runs against embeddings already computed in P2 — do not re-embed documents.
- All new settings in `config.py` with defaults: `EDITION_INTERVAL_MINUTES=30`,
  `EDITION_SIZE=60`, `EDITION_LOOKBACK_HOURS=36`, `EDITION_RECENCY_HALFLIFE_HOURS=8`,
  `EDITION_MAX_SOURCE_SHARE=0.30`, `DIGEST_HOUR=7`.

## Constraints & non-goals
- No user accounts, no per-user profiles, no login. One profile.
- No click-tracking, no learned personalization, no recommendation model. Ranking is hand-weighted
  and inspectable — `edition_items.reason` must always explain the placement in plain Hebrew.
- No comments, no sharing, no bookmarking in v1.
- No full-text article scraping beyond what P1 already does under `allows_fulltext_storage`.
- Do NOT modify the analyst path: `kind='monitoring'` watchlists, P3 signals, alerts, and analyst
  reports must behave identically. Their tests are the regression suite.
- No frontend in this phase — that is P6.

## Implementation plan
1. Migration `0005_personalization`: `feed_subscriptions`, `editions`, `edition_items`,
   `watchlists.kind`, `watchlists.description_embedding`, `watchlists.min_semantic_similarity`,
   `report_schedules.report_type`, `reports.report_type`. Verify: `alembic upgrade head` then
   `downgrade -1` then `upgrade head` clean; full existing test suite still green.
2. `feeds/discovery.py` + `feeds/opml.py` + `curation.py` feed routes + conditional-request support
   in `connectors/rss.py`. Verify: discovery finds the feed for 5 real sites in a recorded-fixture
   test; OPML round-trip is lossless.
3. Topics: `kind` handling, description embedding, hybrid matching in `pipeline/matcher.py`,
   topic routes. Verify: a regression test asserts monitoring-watchlist match results are identical
   before and after this change on a 200-document fixture.
4. `site/ranking.py` + `site/weights.py` + tests.
5. `site/edition.py` + diversity constraints + `site/serializers.py` + beat task.
6. `site/blurb.py`.
7. Site API routes.
8. `reports/digest_builder.py` + `digest_renderer.py` + `llm/prompts/daily_digest.md` + schedule
   type handling + seeded 07:00 schedule.

## Verification (definition of done)
- `uv run pytest` — all green. **Every P0–P4 test must still pass unmodified.** If an existing test
  must change, stop and report why rather than editing it.
- `uv run ruff check . && uv run mypy src/` — clean.
- **Licensing gate:** `tests/site/test_no_fulltext_leak.py` walks every route under `/site/` with a
  fixture where `allows_fulltext_storage = false` and asserts no response field ever contains more
  than 400 characters of source text and `body` is never present in any payload. Do not weaken it.
- **Diversity gate:** `tests/site/test_edition_diversity.py` on a fixture where one source produced
  40 of 100 candidates asserts that source holds ≤30% of the edition and no event appears twice.
- **Ranking determinism gate:** building an edition twice from the same fixture and frozen clock
  produces identical `edition_items` ordering.
- **Regression gate:** `tests/pipeline/test_matcher.py` and the P3 signal gates pass unchanged.
- End-to-end scenario:
  1. `curl -X POST localhost:8000/feeds/discover -d '{"url":"https://www.calcalist.co.il"}'` returns
     at least one feed.
  2. `POST /feeds` with 8 feeds, `POST /topics` with 3 topics (Hebrew descriptions, no keywords —
     semantic matching only).
  3. Run ingestion, then `POST /site/refresh`.
  4. `GET /site/edition/current` returns ≥20 items across ≥3 sections, every item has a `reason`
     string in Hebrew, and every item links to an external URL.
  5. `curl -X POST localhost:8000/reports/generate -d '{"report_type":"daily_digest",
     "lookback_hours":24}'` produces Hebrew Markdown grouped by topic; every link in it resolves to
     a document that exists in the database.
- `uv run python scripts/report_audit.py --report <digest_id>` exits 0 (no invented figures).

## Working style
One commit per numbered step, conventional commits. Append a `## Personal site` section (≤25 lines)
to `CLAUDE.md` documenting: topic = watchlist with `kind='interest'`, editions are immutable
snapshots, and the 400-character licensing rule. Do not add a dependency without listing it and its
justification. Final report must include: number of feeds subscribed, items in the current edition,
the source-share distribution of that edition, semantic-vs-keyword match ratio per topic, and the
LLM cost of one daily digest.
