# Task: Build the source layer — batch RSS onboarding, API sources, and keyword + country targeting

## Context
Read `CLAUDE.md` first. NewsRadar currently works as an internal monitoring system: P0 schema,
P1 ingestion (GDELT/RSS/Telegram/YouTube/Perigon → deduplicated `documents`), P2 enrichment
(embeddings, entities, geo, entity-targeted stance) and event clustering, P3 signals/alerts/analyst
reports, P4 the Hebrew analyst dashboard.

This phase and the two that follow add a **second product**: a personal, English-language news site
assembled from sources the user chooses, filtered by their keywords and countries. The analyst
monitoring product is unchanged and its tests are the regression suite.

This phase is the source layer only: getting the user's chosen sources into the system at scale,
and targeting documents by keyword **and** country. Translation, editions, digests and the site UI
come in P6 and P7.

ASSUMPTION: single user/profile. No accounts, no per-user isolation.
ASSUMPTION: the user pastes ordinary news-site URLs, not feed URLs — feed discovery is the system's
job, and it must succeed on messy input (missing scheme, trailing paths, `www` variants, duplicates).

## Objective
The user pastes 150 news-site URLs into one textarea, submits once, and within a couple of minutes
has working RSS subscriptions for every site that exposes a feed, with a per-line report of what
succeeded, what was already subscribed, and what had no discoverable feed. They define an interest
as `{keywords, countries}` and the system routes matching documents to it, correctly distinguishing
"published by an outlet in France" from "a story about France".

## Requirements

### Source rights (do this first — everything else depends on it)
1. Add `sources.content_rights` enum (`link_only | extract_ok | full_ok`), **default `link_only`**,
   replacing the boolean `allows_fulltext_storage`. Migration must map existing
   `true → full_ok`, `false → link_only`. Keep a `rights_note` text column for why a source was
   upgraded (e.g. "licensed wire", "own property", "publisher permission email 2026-03-11").
   - `link_only`: store title + up to 300 chars of extract. `documents.body` stays NULL.
   - `extract_ok`: store title + up to 400 chars of extract. `body` stays NULL.
   - `full_ok`: full body may be stored.
   Enforce in `pipeline/normalize.py`. A newly discovered source is ALWAYS `link_only`; upgrading is
   a deliberate manual action through the API, never automatic and never inferred from the feed.
2. Capture presentation metadata during ingestion so P7 can render article-grade cards, into a new
   `document_media` table: `document_id` pk fk, `image_url`, `image_width`, `image_height`,
   `image_alt`, `og_title`, `og_description`, `og_site_name`, `favicon_url`, `byline`,
   `frameable` bool nullable, `fetched_at`.
   - Read `media:content` / `media:thumbnail` / `enclosure` from RSS first.
   - Only if absent, fetch the article URL's `<head>` (HEAD-then-ranged-GET, max 64KB) for OG tags.
   - `frameable`: from the same fetch, `false` if `X-Frame-Options` is set or the CSP contains
     `frame-ancestors` excluding us; `true` if neither; NULL if not determined. Cache per domain in
     a `domain_frameability` table (`domain` pk, `frameable`, `checked_at`) and re-check monthly.
   - **Store the image URL only. Never download, cache, resize, or re-host images.** Hotlinking with
     attribution is the legally safe posture here.

### Batch source onboarding
3. `feeds/discovery.py`: `discover_feeds(url) -> list[DiscoveredFeed]`. Normalize input first
   (add scheme if missing, strip paths/query, try `www` and apex). Then: `<link rel="alternate">`
   in `<head>`, then well-known paths (`/feed`, `/rss`, `/rss.xml`, `/feed.xml`, `/atom.xml`,
   `/index.xml`, `/feeds/posts/default`, `/?feed=rss2`), then any same-host `<a>` whose href
   matches `/(rss|feed|atom)/i`. Validate each candidate by parsing it and requiring ≥1 item.
   Return `{feed_url, title, site_title, item_count, last_published_at, detected_lang,
   detected_country}`. Never crawl beyond the given host; max 10 HTTP requests per site.
4. `feeds/opml.py`: OPML 2.0 import and export, folder names preserved as tags.
5. New table `feed_subscriptions` (migration `0005_sources`): `id`, `source_id` fk, `feed_url`
   unique, `title`, `tags` text[], `country_code` char2 nullable, `lang` varchar8 nullable,
   `poll_interval_seconds` default 600, `active` bool, `last_polled_at`, `last_ok_at`,
   `consecutive_failures` default 0, `etag`, `last_modified`, `created_at`.
   Creating a subscription creates or reuses a `sources` row matched on registrable domain
   (use `tldextract` so `bbc.co.uk` and `www.bbc.co.uk` collapse correctly).
6. Batch jobs — new table `source_import_jobs` (`id`, `status` enum
   `pending|running|done|failed`, `total`, `processed`, `created_at`, `finished_at`) and
   `source_import_results` (`id`, `job_id` fk cascade, `input_line`, `normalized_url`,
   `status` enum `added|duplicate|no_feed|invalid|error`, `feed_url` nullable, `title` nullable,
   `error` nullable).
   `POST /sources/batch` accepts up to 500 lines (newline, comma, or OPML file) and returns a job
   id immediately; a Celery task runs discovery with concurrency 8 and a per-site 15s timeout.
   `GET /sources/batch/{job_id}` returns progress plus every per-line result. A single bad line
   never fails the job.
7. Extend `connectors/rss.py` to poll `feed_subscriptions` alongside `config/feeds.yaml`, using
   stored `etag` / `If-Modified-Since` and persisting the response values. `consecutive_failures
   >= 10` auto-deactivates the subscription and records the reason.

### API-backed sources
8. New table `api_sources`: `id`, `provider` enum (`gdelt|perigon`), `name`, `enabled` bool,
   `country_filter` char2[], `lang_filter` text[], `extra_params` jsonb, `created_at`.
   These let the user pull from global providers scoped to chosen countries, without subscribing to
   individual outlets. `connectors/gdelt.py` and `perigon.py` read their query scope from these rows
   in addition to the watchlist terms. Perigon stays behind `PERIGON_API_KEY`; GDELT needs no key.

### Keyword + country targeting
9. Add `watchlists.kind` enum (`monitoring | interest`), default `monitoring`. An **interest** is a
   `watchlists` row with `kind='interest'`. Reuse `watchlist_terms` for keywords. Do NOT build a
   parallel model.
10. Add to `watchlists`: `source_country_filter` char2[] nullable, `subject_country_filter` char2[]
    nullable, `country_match_mode` enum (`source | subject | either`) default `either`.
    - **source country** = `sources.country_code` (where the outlet is based).
    - **subject country** = `document_enrichment.geo.country_code` (what the story is about).
    These are different questions and the user must be able to ask either. Document this distinction
    in the API schema descriptions — it is the single most confusing part of the product.
11. Add `watchlists.description_embedding vector(1024)` and `min_semantic_similarity` float default
    0.78. On create/update of an interest's description, embed `"query: " + description` with the
    existing `multilingual-e5-large` model.
12. `pipeline/matcher.py` gains hybrid matching **for `kind='interest'` only**: a document matches if
    the keyword/boolean matcher fires OR cosine similarity to `description_embedding` ≥ threshold;
    then the country filter is applied per `country_match_mode`. Record the path in
    `document_matches.matched_terms` (sentinel `__semantic__`) and reflect it in `match_score`
    (keyword hits outrank semantic-only). **Matching for `kind='monitoring'` must be byte-for-byte
    unchanged** — that is a gated regression test.

### API
13. `api/routers/sources.py`: `GET/POST/PATCH/DELETE /sources` (rights management —
    `PATCH /sources/{id}/rights` requires a `rights_note` in the body, and rejects an upgrade to
    `full_ok` without one), `GET /feeds`, `POST /feeds`, `PATCH /feeds/{id}`, `DELETE /feeds/{id}`,
    `POST /feeds/discover`, `POST /sources/batch`, `GET /sources/batch/{job_id}`,
    `POST /feeds/import-opml`, `GET /feeds/export-opml`, `GET /feeds/health`,
    `GET/POST/PATCH/DELETE /api-sources`.
14. `api/routers/interests.py`: `GET/POST/PATCH/DELETE /interests` (POST body: `{name, description,
    keywords[], source_countries[], subject_countries[], country_match_mode, lang_filter[]}`),
    plus `GET /interests/{id}/preview?limit=10` returning the most recent matching documents so the
    UI can calibrate the threshold live.

## Technical decisions (follow these — do not re-litigate)
- `tldextract` for domain normalization. `feedparser` for parsing. `selectolax` for the lightweight
  `<head>` parse (do not pull in BeautifulSoup for this).
- All outbound fetches in discovery and OG extraction go through one rate-limited client
  (`feeds/http.py`) with per-host concurrency 2, a 15s timeout, and a descriptive User-Agent
  including a contact URL. Respect `robots.txt` for the OG fetch.
- Batch discovery is a Celery task, never inline in the request. The API returns a job id in <200ms.
- Country codes are ISO 3166-1 alpha-2 everywhere. Reject anything else at the schema level.
- Never guess a source's rights. Default `link_only`, always.

## Constraints & non-goals
- No translation, no editions, no ranking, no digest, no share links — those are P6.
- No frontend — that is P7.
- No user accounts, no auth.
- No general web crawler. Discovery touches only the host the user pasted; OG extraction touches
  only URLs that already arrived through a subscribed feed.
- Do not download or re-host images, article bodies, or PDFs.
- Do NOT modify the analyst path: `kind='monitoring'` behavior, P3 signals, alerts and analyst
  reports must be identical after this phase.

## Implementation plan
1. Migration `0005_sources`: `content_rights` (with data migration from the boolean),
   `rights_note`, `document_media`, `domain_frameability`, `feed_subscriptions`,
   `source_import_jobs`, `source_import_results`, `api_sources`, and the `watchlists` additions.
   Verify: `upgrade head` → `downgrade -1` → `upgrade head` clean; full existing suite green.
2. `feeds/http.py` + `feeds/discovery.py` + tests against recorded fixtures for 8 real sites
   including one with no feed and one that only exposes a feed via an `<a>` tag.
3. `feeds/opml.py` (round-trip test) + `feed_subscriptions` CRUD + conditional polling in
   `connectors/rss.py`.
4. Batch import: job tables, Celery task, `POST /sources/batch` + `GET /sources/batch/{id}`.
5. Rights enforcement in `pipeline/normalize.py` + `PATCH /sources/{id}/rights`.
6. `document_media` extraction (RSS media first, OG fallback) + frameability probe + domain cache.
7. `api_sources` + wiring into `gdelt.py` / `perigon.py`.
8. Interests: `kind`, description embedding, country filters, hybrid matcher, interest routes,
   preview endpoint.

## Verification (definition of done)
- `uv run pytest` — all green. **Every P0–P4 test must pass unmodified.** If one must change, stop
  and report why instead of editing it.
- `uv run ruff check . && uv run mypy src/` — clean.
- **Rights gate:** `tests/pipeline/test_content_rights.py` — for a `link_only` source, ingesting a
  full article stores `body IS NULL` and `length(summary) <= 300`; for `extract_ok`, `<= 400`; for
  `full_ok`, the body is stored. Do not weaken this test.
- **Default-safety gate:** a newly discovered source created through `POST /sources/batch` always
  has `content_rights = 'link_only'`, and `PATCH /sources/{id}/rights` to `full_ok` without a
  `rights_note` returns 422.
- **Regression gate:** `tests/pipeline/test_matcher.py` passes unchanged, and a new test asserts
  monitoring-watchlist match output is identical on a 200-document fixture before and after the
  hybrid-matching change.
- **Country semantics gate:** `tests/pipeline/test_country_filter.py` — a Reuters (GB) article about
  Brazil matches `source_countries=['GB']` in `source` mode, matches
  `subject_countries=['BR']` in `subject` mode, and matches both in `either` mode. Never the wrong one.
- End-to-end scenario:
  1. `POST /sources/batch` with 20 pasted site URLs (mixed formats: bare domains, URLs with paths,
     one duplicate, one nonexistent domain) → job completes; results show `added` for the real
     sites, `duplicate` for the repeat, `invalid` or `no_feed` for the rest — no crash.
  2. Run ingestion; `SELECT count(*) FROM documents d JOIN sources s USING(source_id) WHERE
     s.id IN (batch sources)` is > 0, and `document_media` is populated with an `image_url` for
     the majority of them.
  3. `POST /interests` with a plain-English description, `subject_countries=['UA','PL']`,
     `country_match_mode='subject'` → `GET /interests/{id}/preview` returns matching documents,
     none of which are about other countries.
- Batch performance: 150 URLs complete in under 5 minutes.

## Working style
One commit per numbered step, conventional commits. Append a `## Sources & rights` section (≤20
lines) to `CLAUDE.md` documenting the three `content_rights` tiers, the "default `link_only`, never
infer" rule, the no-image-rehosting rule, and the source-vs-subject country distinction. Do not add
a dependency without listing it and its justification. Final report: number of feeds discovered from
the batch, discovery success rate, `document_media` coverage percentage, frameability rate across
domains, and any site whose feed you could not find and why.
