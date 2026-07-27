# CLAUDE.md — NewsRadar

## Project overview
NewsRadar is a global news & social intelligence platform for a newsroom. Editors define
watchlists (keywords + entities); the system continuously ingests news articles, social posts
and forum discussion worldwide, clusters them into **events**, scores them for heat and
negativity, and emits scheduled detailed reports plus real-time alerts.
Primary languages of monitored content: Hebrew, Arabic, English. UI is Hebrew (RTL).

## Stack (pinned — do not substitute)
- Python 3.12, `uv` for dependency management (`uv sync`, `uv run`)
- FastAPI 0.115+, Pydantic v2, SQLAlchemy 2.0 (async), Alembic
- PostgreSQL 16 + `pgvector` 0.7+ extension
- Redis 7 + Celery 5.4 (worker + beat) for queues and scheduling
- `sentence-transformers` with `intfloat/multilingual-e5-large` (1024-dim embeddings)
- Anthropic SDK (`anthropic`) — `claude-haiku-4-5-20251001` for per-document classification,
  `claude-sonnet-5` for event summaries and report generation
- Frontend: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, MapLibre GL, Recharts
- Tests: pytest + pytest-asyncio + testcontainers-python; frontend: vitest
- Lint/format: ruff (lint + format), mypy strict on `src/newsradar/`; eslint + prettier in `web/`

## Commands
```bash
uv sync                              # install deps
docker compose up -d                 # postgres + redis
uv run alembic upgrade head          # migrations
uv run uvicorn newsradar.api.main:app --reload   # API on :8000
uv run celery -A newsradar.tasks.celery_app worker -l info
uv run celery -A newsradar.tasks.celery_app beat -l info
uv run pytest                        # full test suite
uv run ruff check . && uv run ruff format --check . && uv run mypy src/
cd web && npm run dev                # dashboard on :3000
```

## Architecture map
```
src/newsradar/
├── config.py           Settings (pydantic-settings), all secrets from env
├── db/                 models.py (SQLAlchemy), session.py, base.py
├── connectors/         One module per source. All subclass BaseConnector.
│                       base.py, gdelt.py, rss.py, telegram.py, youtube.py,
│                       perigon.py, registry.py
├── pipeline/           normalize.py, dedup.py, matcher.py, embed.py,
│                       enrich.py, cluster.py
├── signals/            velocity.py, diversity.py, negativity.py, geo.py, scoring.py
├── llm/                client.py (retry//rate-limit wrapper), schemas.py (Pydantic
│                       output contracts), prompts/ (*.md templates)
├── reports/            builder.py, renderer.py, delivery.py
├── tasks/              celery_app.py + one module per periodic job
└── api/                main.py, routers/, deps.py
web/                    Next.js dashboard
migrations/             Alembic — NEVER hand-edit applied migrations
tests/                  Mirrors src/ layout
```

## Data model — core entities
`sources` → `documents` → `document_enrichment` / `document_matches` / `stance_assessments`
`watchlists` → `watchlist_terms`, `watchlist_entities`
`events` ←→ `event_documents`, `event_metrics`, `alerts`
`report_schedules` → `reports`

A **document** is one raw item (article/post). An **event** is a cluster of documents about the
same real-world happening, scoped to a watchlist. Reports are generated over events, never over
raw documents.

## Conventions
- Async everywhere in I/O paths. Celery tasks are sync wrappers that call `asyncio.run()`.
- All external calls go through a connector or `llm/client.py` — never `httpx` inline in business logic.
- Every connector returns `list[RawDocument]` (Pydantic model in `connectors/base.py`). Connectors
  do not touch the DB.
- Timestamps: always timezone-aware UTC. Store as `TIMESTAMPTZ`.
- Language codes: ISO 639-1. Country codes: ISO 3166-1 alpha-2.
- LLM outputs are ALWAYS parsed into a Pydantic schema from `llm/schemas.py`. Never regex an LLM response.
- Errors: connectors raise `ConnectorError`; pipeline stages log and skip a bad document rather
  than failing a whole batch. One poison document must never stall a run.
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `test:`). One commit per phase.

## Hard rules
- NEVER send every ingested document to a frontier LLM. Cheap models + embeddings do the bulk;
  `claude-sonnet-5` runs only on event representatives and report generation. Cost discipline is a
  functional requirement, not a nice-to-have.
- NEVER hardcode API keys. All credentials from env, documented in `.env.example`.
- NEVER hand-edit files under `migrations/versions/` that have already been applied.
- Respect source licensing: store full text only where the provider's terms allow it. The
  `sources.allows_fulltext_storage` flag gates this — honor it in `pipeline/normalize.py`.
- Do not add new dependencies without listing them and their purpose in your report first.
- No abstraction until the second concrete use case. Do not build plugin systems, generic
  rule engines, or config DSLs unless a prompt explicitly asks for one.

## Domain notes the agent cannot infer
- **Sentiment ≠ negativity toward a target.** An article about a terror attack scores negative
  overall but may be favorable to the monitored entity. Negativity must always be *entity-targeted
  stance*, computed per `watchlist_entities` row.
- **Prominence matters.** A negative mention in the headline weighs ~10x a mention in paragraph 14.
  `document_enrichment.prominence` (0.0–1.0) captures this and multiplies into negativity scores.
- **Deduplication is load-bearing.** One wire story republishes across hundreds of outlets. Without
  near-duplicate collapse every metric in the system is wrong.
- **Source diversity beats volume.** 50 documents from 3 outlets is noise; 50 from 40 outlets is a
  real event. Never rank events by raw document count alone.
