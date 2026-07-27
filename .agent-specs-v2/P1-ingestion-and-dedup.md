# Task: Build the ingestion layer — connectors, watchlist matching, deduplication

## Context
Read `CLAUDE.md` first. Phase P0 delivered: the full database schema (migrated), `config.py`,
async session factory, Celery app with Redis, `/health`, and a seed script. All packages under
`src/newsradar/` exist but `connectors/` and `pipeline/` are empty.

This phase makes documents flow into the database from real sources, matched against watchlists and
deduplicated. No NLP beyond language detection — embeddings and clustering come in P2.

Source landscape as of 2026 — these are hard facts, do not attempt to work around them:
- **GDELT 2.0 DOC API** is free, updates every 15 minutes, machine-translates 65 languages into
  English, and returns article metadata + URLs (not full text). Primary global wide net.
- **RSS** from named outlets is free and gives the highest-quality Israeli/Hebrew coverage.
- **Telegram** public channels via MTProto (Telethon) — critical for the Israeli/Middle East beat.
- **YouTube Data API v3** — 10,000 quota units/day, free.
- **Perigon** — paid REST API, rich metadata (sentiment, entities, lat/lon, hard-vs-soft-news
  classification). Implement behind a feature flag; it is optional for local dev.
- **X/Twitter, TikTok, Reddit, Meta are deliberately OUT OF SCOPE for this phase.** X is
  pay-per-use with a 2M read cap, TikTok has no commercial search API, Reddit commercial access
  requires a negotiated contract, and Meta's Content Library bans commercial news outlets. They
  will be added later behind a paid-vendor adapter. Do not write speculative code for them.

## Objective
Running `uv run python -m newsradar.tasks.ingest_once --watchlist demo` pulls fresh documents from
every enabled connector, stores them deduplicated, and links each to the watchlists it matched.
Running it twice in a row adds zero duplicate rows. The Celery beat schedule runs the same pipeline
automatically on a per-connector cadence.

## Requirements
1. `connectors/base.py`: `RawDocument` Pydantic model and `BaseConnector` ABC with
   `async def fetch(self, query: WatchlistQuery, since: datetime) -> AsyncIterator[RawDocument]`,
   plus `name`, `source_type`, `default_interval_seconds`, and a `health_check()`.
2. Connectors implemented: `gdelt.py`, `rss.py`, `telegram.py`, `youtube.py`, `perigon.py`.
   `registry.py` exposes `get_enabled_connectors(settings) -> list[BaseConnector]` — a connector is
   enabled only if its required env vars are present.
3. `pipeline/matcher.py`: compiles a watchlist's terms into a matcher supporting keywords, exact
   phrases, boolean expressions (`AND`/`OR`/`NOT`, parentheses, quoted phrases), exclusion terms,
   and per-language term sets. Returns `(matched: bool, matched_terms: list[str], score: float)`.
   Score = sum of matched term weights, normalized. Must be correct for Hebrew and Arabic text —
   use Unicode word boundaries, not `\b` with ASCII assumptions.
4. `pipeline/normalize.py`: canonical URL (strip UTM and known tracking params, resolve
   `amp`/`m.` variants, lowercase host, drop fragment), `url_hash` (sha256 hex of canonical URL),
   language detection, HTML→text with `trafilatura`, `published_at` normalization to UTC.
   Full body text is stored ONLY when `sources.allows_fulltext_storage` is true; otherwise store
   title + a ≤400-char extract in `summary` and leave `body` NULL.
5. `pipeline/dedup.py`: 64-bit SimHash over the normalized title+first-500-chars. Two documents are
   near-duplicates if Hamming distance ≤ 3 AND `published_at` within 72 hours. The earliest
   document in a duplicate cluster is canonical; later ones get `dedup_of` set and are excluded
   from all downstream metrics. Exact-URL duplicates are rejected at insert via the `url_hash`
   unique constraint (upsert with `ON CONFLICT DO NOTHING`).
6. `tasks/ingest.py`: Celery tasks `ingest_connector(connector_name, watchlist_id)` and
   `ingest_all()`. Beat schedule: GDELT every 15 min, RSS every 10 min, Telegram every 5 min,
   YouTube hourly, Perigon every 15 min.
7. A CLI entrypoint `python -m newsradar.tasks.ingest_once --watchlist <name> [--connector X]
   [--since ISO8601]` that runs the same code path synchronously for debugging.
8. Rate limiting and resilience: per-connector token-bucket limiter, exponential backoff with
   jitter on 429/5xx (`tenacity`), per-connector circuit breaker that opens after 5 consecutive
   failures and logs a `connector.circuit_open` event. A failing connector must never abort a run
   of the others.
9. Ingestion run bookkeeping: log per run — connector, watchlist, fetched count, inserted count,
   duplicate count, error count, duration. Persist to a new `ingestion_runs` table (add an Alembic
   migration `0002_ingestion_runs`).

## Technical decisions (follow these — do not re-litigate)
- HTTP: `httpx.AsyncClient` with a shared, connector-scoped client and a 30s timeout. Set a
  descriptive `User-Agent` including a contact URL.
- RSS: `feedparser` for parsing, `trafilatura` for full-text extraction when permitted.
  The feed list lives in `config/feeds.yaml` (create it with ~120 entries: international wires,
  major English/Arabic/Hebrew outlets, tech and regional press), each entry
  `{url, source_domain, country, lang, tier}`.
- GDELT: use the DOC 2.0 API (`https://api.gdeltproject.org/api/v2/doc/doc`) with
  `format=json`, `mode=artlist`, `maxrecords=250`, and `timespan`/`startdatetime` for windowing.
  Translate the watchlist boolean expression into GDELT query syntax in `gdelt.py`, and cap at
  the API's documented limits — paginate by narrowing the time window, not by an offset param.
- Telegram: Telethon with a string session stored in `TELEGRAM_SESSION`. Channels list in
  `config/telegram_channels.yaml`. Read-only; never send messages or join private channels.
- YouTube: `search.list` + `videos.list` batching; budget-aware — stop when the daily quota
  estimate exceeds `YOUTUBE_DAILY_QUOTA_BUDGET` (default 8000 units).
- Perigon: guarded by `PERIGON_API_KEY`; map its native sentiment/entities/lat-lon straight into
  `documents.raw` for P2 to consume rather than discarding them.
- Inserts: batch upserts of 200 documents per statement using
  `insert(...).on_conflict_do_nothing(index_elements=["url_hash"])`.
- SimHash: implement it in `pipeline/dedup.py` (~40 lines). Do not add a dependency for it.

## Constraints & non-goals
- No embeddings, no entity extraction, no clustering, no LLM calls in this phase.
- No connectors for X, TikTok, Reddit, Facebook, Instagram.
- No web UI, no API routes beyond a `GET /connectors/status` that reports each connector's
  enabled/healthy state and last successful run.
- Do not scrape any site that is not in `feeds.yaml`. No generic web crawler.
- Do not modify `db/models.py` except to add `IngestionRun`.

## Implementation plan
1. `connectors/base.py` + `registry.py` + a `FakeConnector` used by tests. Verify: `uv run pytest
   tests/connectors/test_base.py` green.
2. `pipeline/normalize.py` + `pipeline/matcher.py` with a thorough test suite. Verify: matcher
   tests cover Hebrew phrase matching, Arabic keyword matching, boolean `A AND (B OR C) NOT D`,
   and exclusion terms; URL canonicalization tests cover UTM stripping and AMP variants.
3. `pipeline/dedup.py` + tests using two real near-duplicate wire stories fixed in
   `tests/fixtures/`. Verify: distance ≤3 detected, distinct stories not merged.
4. `connectors/rss.py` + `config/feeds.yaml` + `gdelt.py`. Verify: `python -m
   newsradar.tasks.ingest_once --watchlist demo --connector rss` inserts >0 documents; running it
   again inserts 0.
5. `connectors/telegram.py`, `youtube.py`, `perigon.py` — each skipped gracefully when creds absent.
6. `tasks/ingest.py` + beat schedule + `ingestion_runs` table + migration `0002_ingestion_runs`
   + `GET /connectors/status`.

## Verification (definition of done)
- `uv run pytest` — all green, including all P0 tests still passing. New tests must cover: matcher
  (≥12 cases incl. RTL languages), URL canonicalization, SimHash near-duplicate detection,
  connector circuit breaker, and batch upsert idempotency.
- `uv run ruff check . && uv run mypy src/` — clean.
- Live scenario (requires network): `uv run python -m newsradar.tasks.ingest_once --watchlist demo`
  completes in <5 minutes, and `SELECT connector, fetched, inserted, duplicates FROM ingestion_runs
  ORDER BY started_at DESC LIMIT 10` shows non-zero `inserted` for at least GDELT and RSS.
- Idempotency: run the same command twice; the second run reports `inserted = 0` and
  `duplicates > 0`.
- Offline scenario: with `DATABASE_URL` pointed at a testcontainer and all connectors replaced by
  `FakeConnector`, the full pipeline runs and produces the expected `document_matches` rows.
- `GET /connectors/status` lists every connector with `enabled`, `healthy`, `last_run_at`.

## Working style
One commit per numbered step, conventional commits. Do not add a dependency without listing it and
its justification in your report. Final report must include: per-connector document counts from a
real run, the duplicate-collapse rate observed, and any source you could not reach and why.
