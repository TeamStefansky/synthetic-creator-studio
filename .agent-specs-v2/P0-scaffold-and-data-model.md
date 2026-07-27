# Task: Scaffold NewsRadar and build the complete data model

## Context
Greenfield project. Nothing exists yet. Read `CLAUDE.md` in the repo root before writing anything —
it pins the stack, conventions and hard rules for the whole project. This prompt covers Phase 0
(scaffold) and Phase 1 (schema). No ingestion, no NLP, no UI in this phase.

Domain: a newsroom monitoring tool. Editors define *watchlists* (a topic + its keywords + the
entities whose coverage they care about). The system ingests documents worldwide, clusters them
into events, scores heat and entity-targeted negativity, and produces scheduled reports.

ASSUMPTION: single-tenant deployment for one newsroom. No multi-org isolation in v1.
ASSUMPTION: Postgres and Redis run via `docker compose` locally; production hosting is out of scope.
ASSUMPTION: no user authentication in v1 (the dashboard runs behind the newsroom VPN).

## Objective
A developer can clone the repo, run `docker compose up -d && uv sync && uv run alembic upgrade head
&& uv run pytest`, and get a green test suite plus a fully migrated database containing every table
the rest of the system needs. `GET /health` returns `{"status":"ok","db":"ok","redis":"ok"}`.

## Requirements
1. Repo scaffold with `uv`-managed Python 3.12, ruff, mypy (strict on `src/newsradar/`), pytest.
2. `docker-compose.yml` with `postgres:16` (with `pgvector` — use `pgvector/pgvector:pg16`) and `redis:7`.
3. `src/newsradar/config.py`: pydantic-settings `Settings` reading every env var listed in `.env.example`.
4. Async SQLAlchemy 2.0 session factory in `src/newsradar/db/session.py` using `asyncpg`.
5. Complete schema in `src/newsradar/db/models.py` (spec below) + one Alembic migration that
   creates the `vector` extension and all tables/indexes.
6. FastAPI app in `src/newsradar/api/main.py` with a single `/health` route that actually pings
   Postgres and Redis.
7. Celery app in `src/newsradar/tasks/celery_app.py` with Redis broker + result backend, and one
   `ping` task, plus an empty beat schedule dict ready to be filled by later phases.
8. Seed script `scripts/seed.py` that inserts: ~40 `sources` rows (major global outlets + Israeli
   outlets, with country/lang/tier), and one demo watchlist with 5 terms and 2 entities.
9. Tests: schema smoke test (create all tables against a testcontainer Postgres, insert one row per
   table, assert FK and unique constraints fire), config test, `/health` test.

## Data model (implement exactly)

**sources** — `id` (uuid pk), `name`, `domain` (unique), `source_type` enum
(`news|social|forum|broadcast|blog|aggregator`), `platform` (nullable text: `x`,`telegram`,
`youtube`,`reddit`,...), `country_code` (char2, nullable), `lang` (varchar 8, nullable),
`tier` smallint 1–4 (1 = tier-1 international wire), `credibility_score` float 0–1 default 0.5,
`allows_fulltext_storage` bool default false, `active` bool default true, `meta` jsonb,
`created_at`, `updated_at`.

**watchlists** — `id`, `name` (unique), `description`, `lang_filter` text[] nullable,
`country_filter` char2[] nullable, `active` bool, `created_at`, `updated_at`.

**watchlist_terms** — `id`, `watchlist_id` fk cascade, `term` text, `term_type` enum
(`keyword|phrase|boolean|entity_alias`), `lang` varchar8 nullable, `is_exclusion` bool default false,
`weight` float default 1.0. Unique on (`watchlist_id`,`term`,`lang`).

**watchlist_entities** — `id`, `watchlist_id` fk cascade, `name`, `entity_type` enum
(`person|org|product|place|brand`), `aliases` text[], `is_primary` bool default false.
These are the targets for stance/negativity scoring.

**documents** — `id`, `source_id` fk, `external_id` text nullable, `url` text, `canonical_url` text,
`url_hash` char64 (sha256 of canonical_url) **unique**, `simhash` bigint (indexed), `title` text,
`body` text nullable, `summary` text nullable, `lang` varchar8, `published_at` timestamptz (indexed),
`fetched_at` timestamptz, `author` text nullable, `media_type` enum (`article|post|comment|video|
broadcast_transcript`), `engagement` jsonb (likes/shares/comments/views — nullable per platform),
`raw` jsonb, `dedup_of` uuid fk self-ref nullable (points at the canonical document of a
near-duplicate cluster). Composite index on (`published_at desc`, `source_id`).

**document_matches** — `id`, `document_id` fk cascade, `watchlist_id` fk cascade, `matched_terms`
text[], `match_score` float. Unique on (`document_id`,`watchlist_id`).

**document_enrichment** — `document_id` pk fk cascade, `embedding` `vector(1024)`, `entities` jsonb
(list of `{text,type,offset,confidence}`), `topics` text[], `geo` jsonb
(`{country_code, admin1, lat, lon, confidence}`), `sentiment_overall` float −1..1,
`prominence` float 0..1, `is_opinion` bool, `enriched_at`, `model_version` text.
HNSW index on `embedding` with `vector_cosine_ops`.

**stance_assessments** — `id`, `document_id` fk cascade, `entity_id` fk `watchlist_entities`,
`stance` smallint (−2..+2, CHECK constraint), `confidence` float, `evidence_span` text,
`framing` text nullable, `model` text, `created_at`. Unique on (`document_id`,`entity_id`).

**events** — `id`, `watchlist_id` fk cascade, `title` text, `summary` text nullable,
`centroid` `vector(1024)`, `status` enum (`emerging|active|decaying|closed`) default `emerging`,
`first_seen_at`, `last_seen_at`, `doc_count` int default 0, `source_count` int default 0,
`country_codes` char2[], `geo_centroid` jsonb, `heat_score` float default 0,
`negativity_score` float default 0, `created_at`, `updated_at`.
Index on (`watchlist_id`,`status`,`last_seen_at desc`). HNSW index on `centroid`.

**event_documents** — `event_id` fk cascade, `document_id` fk cascade, `similarity` float,
`added_at`. Composite pk (`event_id`,`document_id`).

**event_metrics** — `id`, `event_id` fk cascade, `bucket_at` timestamptz (hourly bucket),
`doc_count` int, `velocity` float, `acceleration` float, `source_diversity` float,
`negativity_index` float, `cross_platform_lift` float, `heat_score` float.
Unique on (`event_id`,`bucket_at`).

**alerts** — `id`, `event_id` fk cascade, `rule_name` text, `severity` enum (`info|warning|critical`),
`fired_at`, `payload` jsonb, `delivered_at` nullable, `delivery_error` text nullable.

**report_schedules** — `id`, `watchlist_id` fk cascade, `name`, `cron` text, `timezone` text default
`Asia/Jerusalem`, `sections` text[] (e.g. `{overview,hot_events,trends,negative_coverage,geo,sources}`),
`recipients` jsonb, `format` enum (`markdown|html|pdf`), `lookback_hours` int default 24,
`active` bool, `last_run_at` nullable.

**reports** — `id`, `watchlist_id` fk, `schedule_id` fk nullable, `period_start`, `period_end`,
`generated_at`, `markdown` text, `html` text nullable, `artifact_path` text nullable,
`model` text, `input_tokens` int, `output_tokens` int, `event_ids` uuid[].

## Technical decisions (follow these — do not re-litigate)
- SQLAlchemy 2.0 declarative with `Mapped[...]` / `mapped_column`. Type annotations everywhere.
- Native Postgres enums via `sqlalchemy.Enum(..., name="...")`, created in the migration.
- `pgvector.sqlalchemy.Vector(1024)` for embedding columns.
- UUIDv7-style time-ordered ids are unnecessary — use `uuid4` server-side defaults (`gen_random_uuid()`).
- One Alembic migration for this whole phase, named `0001_initial_schema`.
- `.env.example` documents every variable: `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`,
  `PERIGON_API_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `YOUTUBE_API_KEY`, `SMTP_*`,
  `SLACK_WEBHOOK_URL`, `EMBEDDING_MODEL`, `LOG_LEVEL`.
- Structured logging with `structlog`, JSON output in production, console in dev.

## Constraints & non-goals
- Do NOT implement any connector, NLP, clustering, report, or UI code in this phase. Empty package
  `__init__.py` files with a module docstring are correct for `connectors/`, `pipeline/`, `signals/`,
  `reports/`, `llm/`.
- Do NOT add authentication, Docker production images, Kubernetes manifests, or CI config.
- Do NOT add an ORM repository/unit-of-work abstraction layer. Query with sessions directly.
- Do NOT create the `web/` frontend yet.

## Implementation plan
0. Scaffold: `pyproject.toml`, `uv.lock`, ruff/mypy/pytest config, `docker-compose.yml`,
   `.env.example`, package skeleton, `structlog` setup. Verify: `uv run pytest` passes (one dummy
   test), `uv run ruff check .` clean.
1. `config.py` + `db/session.py` + `/health` endpoint + Celery app with `ping` task.
   Verify: `curl localhost:8000/health` returns all-ok; `uv run celery -A ... inspect ping` works.
2. `db/models.py` — full schema above. Verify: `uv run mypy src/` clean.
3. Alembic init + `0001_initial_schema`. Verify: `uv run alembic upgrade head` then
   `uv run alembic downgrade base` then `upgrade head` again, all clean.
4. `scripts/seed.py` + tests. Verify: `uv run python scripts/seed.py` is idempotent (running twice
   does not error or duplicate).

## Verification (definition of done)
- `uv run pytest` — all green, including a schema test that inserts one row into every table and
  asserts the `url_hash` unique constraint and the `stance` CHECK constraint both raise.
- `uv run ruff check . && uv run ruff format --check . && uv run mypy src/` — all clean.
- `uv run alembic upgrade head` from an empty database succeeds; `\d+ documents` shows the expected
  indexes; `SELECT * FROM pg_extension WHERE extname='vector'` returns a row.
- `uv run python scripts/seed.py && uv run python scripts/seed.py` — idempotent, exits 0 both times.
- End-to-end scenario: `GET /health` → `{"status":"ok","db":"ok","redis":"ok"}`.

## Working style
One commit per numbered phase, conventional commit messages. Run ruff + mypy before declaring done.
In your final report list: files created, every table with its row count after seeding, and anything
in the spec you did not implement and why.
