# Synthetic Creator Studio

A **transparency-first** product for creating, managing, and distributing
*disclosed* AI personas (virtual influencers and brand characters). Every
persona is openly labeled as AI across its entire lifecycle. This is **not** an
impersonation tool.

### ▶ Live demo

**https://teamstefansky.github.io/synthetic-creator-studio/** — a static build
of the studio that runs entirely in your browser with seeded sample data (no
backend). Click around the Dashboard, Personas, Studio, and Distribution.
For the full app on the real backend, see *Try it in one command* below.

> The non-negotiable rules live in [`CONSTRAINTS.md`](./CONSTRAINTS.md) and are
> enforced server-side and in tests. Nothing in the codebase may bypass them.

## What this repo contains

A full backend that encodes the "law" with passing tests, plus stubbed
implementations for the GPU/ML and external-API layers (no model weights or live
platform calls in this scaffold), and a Next.js studio/dashboard shell.

```
synthetic-creator-studio/
├── CONSTRAINTS.md            # the law (C1–C6)
├── backend/
│   ├── app/
│   │   ├── constraints.py    # machine-readable constraints + fail-closed errors
│   │   ├── models/           # responsible_entity, persona, synthetic_identity, ...
│   │   ├── disclosure/       # ProvenanceService, VisibleLabeler, DisclosureGate (M2)
│   │   ├── generation/       # GenerationProvider + stub, LoRA, QC, service (M3)
│   │   ├── scenes/           # background + compositing, re-stamped (M4)
│   │   ├── strategy/         # audience/tone/platform strategy (M5)
│   │   ├── distribution/     # platform adapters + HARD publish gate (M6)
│   │   ├── analytics/        # metrics + compliance view (M7)
│   │   ├── safety/           # real-person impersonation guard (C4)
│   │   ├── services/         # persona/entity creation (atomic C3)
│   │   └── api/              # FastAPI routers
│   ├── workers/              # Celery tasks (queue layer)
│   ├── migrations/           # Alembic
│   └── tests/                # the required tests + more
└── frontend/                 # Next.js + TS + Tailwind studio/dashboard shell
```

## Milestones (all scaffolded)

| # | Module | Status |
|---|--------|--------|
| 1 | Foundation + constraints + domain model | implemented, enforced |
| 2 | Disclosure / provenance (before generation) | **real C2PA** Content Credentials backend + HMAC backend, pluggable |
| 3 | Generation engine (per-character LoRA) | **real diffusion+LoRA provider** (GPU) + stub; **LoRA training pipeline** (Celery job, versioned, status-tracked) |
| 4 | Scenes & backgrounds | compositor re-stamps via the generation service |
| 5 | Strategy module | rule-based, plus an analytics → strategy feedback loop |
| 6 | Distribution | **real Instagram + TikTok official-API adapters** + stub + **hard publish gate** |
| 7 | Analytics dashboard | metrics + compliance + strategy feedback; **live-wired** Next.js dashboard |

CI: GitHub Actions runs the full `pytest` suite (incl. a real-C2PA-backend pass) on every push/PR — see `.github/workflows/ci.yml`.

### Pluggable backends (real vs. dependency-light)
- **Provenance (`SCS_PROVENANCE_BACKEND`):**
  - `c2pa` — **real C2PA Content Credentials** embedded into image bytes via
    `c2pa-python` and verified by reading them back (data-hash integrity + AI
    assertion + trust anchor). Dev signing certs are minted automatically.
  - `hmac` (default) — verifiable HMAC-signed manifest + content hash, zero infra.
  - Note: the prebuilt `c2pa` wheel mis-reports `claimSignature` on some
    platforms, so the gate verifies integrity+trust+AI-assertion by default; set
    `SCS_C2PA_REQUIRE_VALID_STATE=true` on a correct build for strict full validation.
- **Generation (`SCS_GENERATION_PROVIDER`):**
  - `diffusion` — real Stable Diffusion + per-persona LoRA (`torch`/`diffusers`,
    GPU). Fails closed with a clear error if the deps are missing.
  - `stub` (default) — deterministic CPU placeholder so the full
    generate → disclose → publish path runs without a GPU.
- **Distribution:** `MetaInstagramAdapter` performs the official two-step
  Instagram Graph API publish and sets Meta's `ai_info.is_ai_generated` flag.
  No scraping, credential sharing, or rate-limit evasion (C5). The stub adapter
  is used by default; the real adapter is wired with per-account credentials.

## Try it in one command

From the repo root:

```bash
./scripts/dev.sh
```

This installs deps (first run), starts the **backend** (`http://localhost:8000`,
Swagger at `/docs`) and the **studio UI** (`http://localhost:3000`), and seeds
demo personas, disclosed assets, published posts, and analytics so every screen
is populated. Open **http://localhost:3000** and click around:

- **Personas** — create a persona (an accountable entity + a required synthetic
  identity are created atomically).
- **Studio** — generate assets; each is visibly labeled `AI · SYNTHETIC` and
  provenance-stamped (`tagged`) before it can be saved.
- **Distribution** — schedule → approve → publish through the hard gate
  (Instagram / TikTok), which refuses anything undisclosed.
- **Dashboard** — live reach/engagement/sentiment, a compliance view, and
  analytics-driven strategy feedback.

Set `SEED=0 ./scripts/dev.sh` to start empty. Re-seed any time with
`python scripts/seed_demo.py` (backend running).

## Run the whole stack with Docker

```bash
docker compose up --build
# open http://localhost:3000   (API + Swagger at http://localhost:8000/docs)
```

Compose seeds demo data on first boot (`SCS_SEED_DEMO=1`). The frontend serves
a runtime proxy at `/api/*` that forwards to `BACKEND_URL`, so the same image
points at any backend without rebuilding.

## Deploy a public link (Render)

This repo ships a Render Blueprint (`render.yaml`) that provisions both
services. In the Render dashboard: **New + → Blueprint**, select this repo and
branch. It deploys the backend (with a persistent disk + auto-seed) and the
frontend, wiring `BACKEND_URL` to the backend's URL automatically. The frontend
URL is your public, clickable demo. Any Docker host (Fly.io, Railway, a VPS)
works too — build the two `Dockerfile`s and set `BACKEND_URL` on the frontend.

## Quickstart (backend)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # core: fastapi, sqlalchemy, pydantic, pillow, pytest
pytest                                    # all tests pass on SQLite, zero infra
uvicorn app.main:app --reload            # http://localhost:8000/docs
```

Postgres + migrations:

```bash
export SCS_DATABASE_URL='postgresql+psycopg://scs:scs@localhost:5432/scs'
alembic upgrade head
```

## Frontend

```bash
cd frontend
npm install
npm run dev   # proxies /api/* to the FastAPI backend
```

## The required tests (Build Brief §6)
- `tests/test_persona_requires_synthetic_identity.py` — C3
- `tests/test_disclosure_gate.py` — C2 blocks untagged assets
- `tests/test_generation_provenance_integration.py` — generate → provenance → gated publish
- `tests/test_publish_fails_closed.py` — missing/invalid manifest fails closed
- `tests/test_real_person_guard.py` — C4 impersonation rejected
