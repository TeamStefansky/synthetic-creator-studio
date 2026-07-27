"""FastAPI application exposing a real dependency-checking ``/health`` endpoint."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import redis.asyncio as aioredis
from fastapi import FastAPI
from sqlalchemy import text

from newsradar.api.routers.alerts import router as alerts_router
from newsradar.api.routers.connectors import router as connectors_router
from newsradar.api.routers.events import router as events_router
from newsradar.api.routers.interests import router as interests_router
from newsradar.api.routers.reports import router as reports_router
from newsradar.api.routers.sources import router as sources_router
from newsradar.api.routers.watchlists import router as watchlists_router
from newsradar.config import get_settings
from newsradar.db.session import get_engine
from newsradar.logging import configure_logging, get_logger

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Configure logging on startup and dispose of the engine on shutdown."""

    configure_logging(get_settings().log_level)
    log.info("newsradar.api.startup")
    yield
    await get_engine().dispose()
    log.info("newsradar.api.shutdown")


app = FastAPI(title="NewsRadar API", version="0.1.0", lifespan=lifespan)
app.include_router(connectors_router)
app.include_router(watchlists_router)
app.include_router(events_router)
app.include_router(reports_router)
app.include_router(alerts_router)
app.include_router(sources_router)
app.include_router(interests_router)


async def _check_db() -> bool:
    """Return True if a trivial query against Postgres succeeds."""

    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:  # noqa: BLE001 - health check must never raise
        log.warning("newsradar.health.db_failed", error=str(exc))
        return False


async def _check_redis() -> bool:
    """Return True if Redis responds to PING."""

    client = aioredis.from_url(get_settings().redis_url)
    try:
        return bool(await client.ping())
    except Exception as exc:  # noqa: BLE001 - health check must never raise
        log.warning("newsradar.health.redis_failed", error=str(exc))
        return False
    finally:
        await client.aclose()


@app.get("/health")
async def health() -> dict[str, str]:
    """Ping Postgres and Redis; report per-dependency status."""

    db_ok = await _check_db()
    redis_ok = await _check_redis()
    status = "ok" if (db_ok and redis_ok) else "degraded"
    return {
        "status": status,
        "db": "ok" if db_ok else "error",
        "redis": "ok" if redis_ok else "error",
    }
