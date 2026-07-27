# NewsRadar

Global news & social intelligence platform for a newsroom. Editors define watchlists
(keywords + entities); the system ingests documents worldwide, clusters them into events,
scores heat and entity-targeted negativity, and emits scheduled reports plus alerts.

This repository currently contains **Phase 0** (scaffold + full data model). No ingestion,
NLP, clustering, reporting or UI code exists yet.

## Quickstart

```bash
docker compose up -d                 # postgres (:5433) + redis (:6380)
uv sync                              # install deps (Python 3.12)
cp .env.example .env                 # configure
uv run alembic upgrade head          # create schema
uv run python scripts/seed.py        # seed sources + demo watchlist
uv run uvicorn newsradar.api.main:app --port 8000
curl -s localhost:8000/health        # {"status":"ok","db":"ok","redis":"ok"}
uv run pytest                        # test suite
```

## Quality gates

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy src/
```

## Ports

NewsRadar uses non-default host ports to avoid clashing with other services:

- Postgres: `localhost:5433` (container 5432)
- Redis: `localhost:6380` (container 6379)
