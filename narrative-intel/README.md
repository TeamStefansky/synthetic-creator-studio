# narrative-intel

Backend service for the **Narrative Intelligence & Media Monitoring** platform
(Cyabra + Meltwater style), built alongside — and independent of — TruthLens.

A modular pipeline that pulls posts from multiple sources through one uniform
connector interface, then layers analysis on top:

1. **Ingestion** — normalize + de-duplicate posts/authors from X, Telegram, RSS,
   NewsAPI (Stage 1).
2. **Authenticity Engine** — per-author 0–100 score from independent signal
   classes, with a per-signal "why suspicious" breakdown (Stage 2).
3. **Coordinated behaviour** — cluster identical content from ≥2 accounts into
   scored campaigns + a co-posting relationship graph (Stage 3).
4. **Narratives & sentiment** — language → sentiment → clustering, volume over
   time, and a **Manipulation Index** (Stage 4).
5. **Alerts** — user rules (volume spike, new narrative/campaign, manipulation
   jump, entity mention) with dedup + cooldown and in-app/webhook/email channels
   (Stage 5).
6. **Reports & public API** — standalone HTML/JSON forensic report per campaign
   or narrative, optional API-key auth + rate limiting (Stage 7).

Everything runs on **SQLite + deterministic mock data with zero config**, so the
whole platform is explorable without any API keys.

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

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | liveness |
| GET | `/api/health` | counts + connector health (mock vs live) |
| GET | `/api/sources` | available sources |
| POST | `/api/ingest/run?source=x` | run one source (or all when omitted) |
| POST | `/api/authenticity/run` | compute authenticity scores (all authors, or `?author_id=`) |
| GET | `/api/authors/{id}` | author detail + per-signal "why suspicious" breakdown |
| POST | `/api/coordination/run` | detect coordinated campaigns (`?window_minutes=`) |
| GET | `/api/campaigns` / `/api/campaigns/{id}` | campaigns + members & evidence |
| GET | `/api/coordination/graph` | co-posting relationship graph (nodes + edges) |
| POST | `/api/narratives/run` | enrich + cluster posts into narratives |
| GET | `/api/narratives` / `/api/narratives/{id}` | narratives + volume over time |
| POST | `/api/alerts/evaluate` | run alert rules, emit alerts |
| GET/POST/DELETE | `/api/alerts/rules` | manage alert rules |
| GET | `/api/alerts` | recent alerts |
| GET | `/api/report/campaign/{id}` | forensic report (`?format=html` default, or `json`) |
| GET | `/api/report/narrative/{id}` | forensic report (`?format=html` default, or `json`) |
| GET | `/api/posts` / `/api/authors` / `/api/runs` | read stored data |

OpenAPI docs at `/docs`.

### Public-API guards

All `/api/*` routes accept optional protection, configured via env (no-ops until
set — the API is open by default for local exploration):

- **API key** — set `API_KEYS` (comma-separated). Requests must then send a
  matching `X-API-Key` header or get `401`.
- **Rate limiting** — a generous in-memory limit per key/IP (`429` when
  exceeded). Suitable for a single-instance MVP.

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
