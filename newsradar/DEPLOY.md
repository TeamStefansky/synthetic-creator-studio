# Deploying NewsRadar

NewsRadar is a **six-process** system, so it cannot run on the TruthLens Vercel
app (Vercel is serverless/stateless — no long-running Celery worker, no Postgres,
no Redis). It needs a host that runs containers plus managed Postgres + Redis.
This guide covers two paths:

1. **Render** (recommended — one blueprint provisions everything) — `render.yaml`.
2. **Any Docker host** (a VM, Fly.io, Railway, self-hosted) — `docker-compose.yml`.

## The processes

| Process | What it is | Command |
| --- | --- | --- |
| `api` | FastAPI (uvicorn) | `uvicorn newsradar.api.main:app --host 0.0.0.0 --port 8000` |
| `worker` | Celery worker (ingest, enrich, cluster, reports, editions) | `celery -A newsradar.tasks.celery_app worker -l info` |
| `beat` | Celery beat (periodic schedule) | `celery -A newsradar.tasks.celery_app beat -l info` |
| `web` | Next.js 15 reader/dashboard | `node server.js` (standalone) |
| Postgres 16 + `pgvector` | primary datastore + vector index | managed |
| Redis 7 | Celery broker + result backend | managed |

`api`, `worker`, and `beat` share **one** Docker image (`./Dockerfile`); `web`
has its own (`./web/Dockerfile`).

## Embeddings: the one real deployment decision

The pipeline needs a 1024-dim text embedder. There are two providers, selected by
`EMBEDDING_PROVIDER`:

- **`sentence-transformer`** (default): the real `intfloat/multilingual-e5-large`
  model. Best semantic quality (proper cross-lingual clustering / interest
  matching). Requires the `embeddings` extra (torch + sentence-transformers,
  ~2 GB image) and meaningful RAM (≥2 GB; a GPU is optional). Build the backend
  image with `--build-arg INSTALL_EMBEDDINGS=1`.
- **`hashing`**: the built-in `HashingEmbedder` — deterministic bag-of-tokens,
  same 1024 dims (schema-compatible), **no torch, no download**. Lower semantic
  quality (lexical overlap only, weak cross-lingual), but a real, reproducible
  embedder — never a fake. Use it for a cheap/constrained deploy or a smoke test.

The provided `render.yaml` and the compose `full` profile default to **`hashing`**
so the stack comes up cheaply out of the box. Switch to the real model once you
have a plan with the RAM for it (see below).

> The embedding dimension (1024) is fixed in the migrations. Switching providers
> is safe (both emit 1024-dim vectors), but vectors from one provider are not
> comparable to the other's — re-embed (`force=True`) after switching for
> consistent clustering.

---

## Path 1 — Render (blueprint)

`render.yaml` provisions: managed Postgres 16, Redis, `api`, `worker`, `beat`,
and `web`.

1. Push this repo to GitHub (already done: `teamstefansky/synthetic-creator-studio`).
2. In Render: **New → Blueprint**, pick the repo. Because `render.yaml` lives in
   `newsradar/`, either set each service's **Root Directory** to `newsradar`, or
   copy `render.yaml` to the repo root before applying.
3. Fill the secret env vars (marked `sync: false`) in the dashboard:
   - `ANTHROPIC_API_KEY` — required for enrichment/summaries/reports.
   - `PERIGON_API_KEY` + set `PERIGON_ENABLED=true` — optional paid news API.
   - `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` / `TELEGRAM_SESSION` — optional.
   - `YOUTUBE_API_KEY` — optional.
   - `SMTP_*` — optional, for emailed digests/reports.
   - `SLACK_WEBHOOK_URL` — optional, for alerts.
4. On **`newsradar-web`**, after the API service exists, set **both** to the API's
   public URL (e.g. `https://newsradar-api.onrender.com`):
   - `API_BASE` (Server Components) and `NEXT_PUBLIC_API_BASE` (browser bundle).
   `NEXT_PUBLIC_API_BASE` is inlined at build time, so a change triggers a web
   rebuild.
5. `DATABASE_URL` and `REDIS_URL` are wired automatically from the managed
   Postgres/Redis. The app normalizes `postgres://`/`postgresql://` to the
   `postgresql+asyncpg://` driver it needs, so the host's default URL just works.
6. Migrations run automatically on each API deploy via the service
   `preDeployCommand: alembic upgrade head`.

### Turning on the real embedding model on Render
1. On `newsradar-api` **and** `newsradar-worker`, add a Docker build arg
   `INSTALL_EMBEDDINGS=1` (Settings → Docker → Build args) and set
   `EMBEDDING_PROVIDER=sentence-transformer`.
2. Move both services to a plan with ≥2 GB RAM.
3. Redeploy. First run downloads the model (~2 GB) into the image build.

### Seeding sources
The system ingests from the sources configured in `config/feeds.yaml` /
`config/telegram_channels.yaml` and any added via the API. Run the seed once
against the deployed DB:
```bash
# from a Render Shell on the api service (or locally with DATABASE_URL set)
python scripts/seed.py
```

---

## Path 2 — Docker Compose (any Docker host)

Local ports avoid clashes: Postgres `5433`, Redis `6380`, API `8000`, web `3000`.

```bash
cd newsradar
cp .env.example .env          # fill ANTHROPIC_API_KEY etc.

# Full containerized stack (api + worker + beat + web + pg + redis):
docker compose --profile full up -d --build

# API health:
curl -s localhost:8000/health   # {"status":"ok","db":"ok","redis":"ok"}
# Reader/dashboard:
open http://localhost:3000
```

- The `api` service runs `alembic upgrade head` on start, so the schema is created
  automatically.
- Defaults to `EMBEDDING_PROVIDER=hashing`. To use the real model, rebuild the
  backend image with `INSTALL_EMBEDDINGS=1` and set
  `EMBEDDING_PROVIDER=sentence-transformer` in `.env`.
- The lightweight dev flow is unchanged: plain `docker compose up -d` still brings
  up only Postgres + Redis, and you run the API/worker on the host via `uv`.

### Building the images by hand
```bash
# Backend (lean, hashing embedder):
docker build -t newsradar-backend:latest .
# Backend with the real embedding model:
docker build --build-arg INSTALL_EMBEDDINGS=1 -t newsradar-backend:emb .
# Web (NEXT_PUBLIC_API_BASE is baked in at build time):
docker build --build-arg NEXT_PUBLIC_API_BASE=https://api.example.com \
  -t newsradar-web:latest ./web
```

---

## Environment variables

All variables are documented in `.env.example`. The deployment-critical ones:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgres://`/`postgresql://` accepted; normalized to asyncpg. |
| `REDIS_URL` | yes | Celery broker + backend. |
| `ANTHROPIC_API_KEY` | for enrichment | Without it, enrichment degrades to embeddings + heuristics. |
| `EMBEDDING_PROVIDER` | no | `sentence-transformer` (default) or `hashing`. |
| `API_BASE` / `NEXT_PUBLIC_API_BASE` | web only | Both = the API's public URL. |
| `PERIGON_API_KEY` + `PERIGON_ENABLED` | no | Paid news aggregator connector. |
| `TELEGRAM_*`, `YOUTUBE_API_KEY` | no | Optional official connectors. |
| `SMTP_*` | no | Emailed digests/reports. |
| `SLACK_WEBHOOK_URL` | no | Alert delivery. |
| `LLM_DAILY_BUDGET_USD` | no | Hard daily LLM spend guard (default 25). |

## Data sources & rights (unchanged in deployment)

NewsRadar ingests only from **official, authorized endpoints** — RSS/Atom,
Perigon, the Telegram API (Telethon, read-only), the YouTube Data API. **No
scrapers** (per `CLAUDE.md` hard rules). Every source starts `link_only`
(title + ≤300-char extract, no body stored); upgrading rights is a manual API
action requiring a `rights_note`. Deploying does not change these gates.

## Health & observability

- `GET /health` returns `{status, db, redis}` — use it as the load-balancer /
  Render health check (already wired in `render.yaml`).
- Logs are structured (structlog); set `LOG_LEVEL` (default `INFO`).
- Celery task state is tracked (`task_track_started=True`); inspect with
  `celery -A newsradar.tasks.celery_app inspect active`.
