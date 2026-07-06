# narrative-intel

Backend service for the **Narrative Intelligence & Media Monitoring** platform
(Cyabra + Meltwater style), built alongside — and independent of — TruthLens.

**Stage 1 (this milestone): the ingestion layer.** A modular pipeline that pulls
posts from multiple sources through one uniform connector interface, normalizes
them, de-duplicates for idempotency, and stores them for the analysis stages to
come (authenticity, coordination, narratives, alerts, dashboard, reports).

## Run locally

```bash
cd narrative-intel
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head            # create tables (SQLite by default)
uvicorn app.main:app --reload   # API at http://localhost:8000/docs
python -m app.worker            # (separate terminal) ingestion scheduler
```

Runs on **SQLite + mock data with zero config**. Point `DATABASE_URL` at
Postgres and set source credentials (`X_BEARER_TOKEN`, `NEWSAPI_KEY`, …) for
live data — see `.env.example`.

## API (Stage 1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | liveness |
| GET | `/api/health` | counts + connector health (mock vs live) |
| GET | `/api/sources` | available sources |
| POST | `/api/ingest/run?source=x` | run one source (or all when omitted) |
| GET | `/api/posts` / `/api/authors` / `/api/runs` | read stored data |

OpenAPI docs at `/docs`.

## Architecture

```
connectors (X, Telegram, RSS, NewsAPI) ─► ingest.service ─► Postgres/SQLite
   SourceConnector.fetch()/normalize()      dedup + dead-letter + IngestRun
                                            ▲
                        app.worker (scheduler: interval + retry/backoff)
```

- **`app/connectors/`** — one module per source implementing `SourceConnector`
  (`fetch`, `normalize`, `rate_limit`, `health`). Real path when a key is set;
  deterministic mock fixtures otherwise (identical shapes, so `normalize` is the
  same for both).
- **`app/ingest/`** — `service.ingest_source()` runs fetch → normalize → dedup →
  upsert. Per-item failures go to `dead_letters`; each run is recorded in
  `ingest_runs`.
- **Dedup** is idempotency on `(source, source_post_id)`. `content_hash` is
  stored but **not** a dedup key on purpose — identical text from *different*
  accounts is the coordinated-behaviour signal Stage 3 will cluster on.
- **Migrations** (`migrations/`) are reversible and DB-agnostic.

## Tests

```bash
pytest        # unit (dedup, connectors) + end-to-end ingestion on SQLite
```

## Deploy

`render.yaml` provisions a Postgres DB, a web service (API), and a worker
(scheduler). See `docs/ROADMAP.md` for the remaining stages.
