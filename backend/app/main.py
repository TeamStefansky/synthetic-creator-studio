"""FastAPI application entrypoint for Synthetic Creator Studio."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    analytics,
    assets,
    distribution,
    entities,
    generation,
    lora,
    personas,
    strategy,
)
from app.api.deps import install_exception_handlers
from app.config import get_settings
from app.db import init_db


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Transparency-first studio for disclosed AI personas. See CONSTRAINTS.md.",
    )

    install_exception_handlers(app)

    # Allow the Next.js studio (dev + same-origin proxy) to call the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def _startup() -> None:
        # Dev/test convenience; prod uses Alembic migrations.
        init_db()
        if settings.seed_demo:
            from app.db import SessionLocal
            from app.demo_seed import seed_if_empty

            session = SessionLocal()
            try:
                seed_if_empty(session)
            finally:
                session.close()

    @app.get("/healthz", tags=["meta"])
    def healthz() -> dict:
        return {"status": "ok", "app": settings.app_name}

    @app.get("/constraints", tags=["meta"])
    def constraints() -> dict:
        from app.constraints import Constraint

        return {c.value: c.title for c in Constraint}

    app.include_router(entities.router)
    app.include_router(personas.router)
    app.include_router(generation.router)
    app.include_router(assets.router)
    app.include_router(lora.router)
    app.include_router(strategy.router)
    app.include_router(distribution.router)
    app.include_router(analytics.router)
    return app


app = create_app()
