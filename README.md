# Synthetic Creator Studio

A **transparency-first** product for creating, managing, and distributing
*disclosed* AI personas (virtual influencers and brand characters). Every
persona is openly labeled as AI across its entire lifecycle. This is **not** an
impersonation tool.

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
| 2 | Disclosure / provenance (before generation) | implemented (HMAC-signed manifest standing in for native C2PA) |
| 3 | Generation engine (per-character LoRA) | interface + stub provider; provenance on every emit |
| 4 | Scenes & backgrounds | compositor re-stamps via the generation service |
| 5 | Strategy module | implemented (rule-based stand-in for cultural/trend analytics) |
| 6 | Distribution | adapters + **hard publish gate**; fails closed |
| 7 | Analytics dashboard | metrics + compliance view; UI shell |

### Honest notes on the stubs
- **Provenance:** real Content Credentials use `c2pa-python`. That native
  toolchain isn't available in the build sandbox, so `ProvenanceService` provides
  the same guarantees (tamper-evident, verifiable, asset-bound) via an
  HMAC-signed manifest + content hash, behind a stable interface. Swap the
  signer/embedder to go native; the rest of the app is unaffected.
- **Generation:** real generation uses a diffusion pipeline + per-persona LoRA on
  GPU. `StubGenerationProvider` implements the `GenerationProvider` interface so
  the full generate → disclose → publish path is exercisable without a GPU.
- **Distribution:** adapters model official-API posting (incl. setting each
  platform's AI-label flag). No scraping, credential sharing, or rate-limit
  evasion is modeled or permitted.

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
