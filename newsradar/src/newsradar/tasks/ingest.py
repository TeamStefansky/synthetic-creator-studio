"""Celery ingestion tasks and the per-connector beat schedule.

Celery tasks are thin synchronous wrappers that call the async pipeline via
``asyncio.run`` (per the project convention). Because the async engine binds to
the loop that created it, we dispose and rebuild it around each task run.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable
from typing import Any

from celery.schedules import schedule

from newsradar.config import get_settings
from newsradar.connectors.registry import CONNECTOR_CLASSES, get_enabled_connectors
from newsradar.db.session import get_engine, get_sessionmaker
from newsradar.logging import get_logger
from newsradar.pipeline.runner import RunResult, ingest
from newsradar.tasks.celery_app import celery_app

log = get_logger(__name__)

# Per-connector cadence (seconds).
BEAT_INTERVALS: dict[str, int] = {
    "gdelt": 15 * 60,
    "rss": 10 * 60,
    "telegram": 5 * 60,
    "youtube": 60 * 60,
    "perigon": 15 * 60,
}


def _run_async[T](coro: Awaitable[T]) -> T:
    try:
        return asyncio.run(coro)  # type: ignore[arg-type]
    finally:
        with contextlib.suppress(Exception):
            asyncio.run(get_engine().dispose())
        get_engine.cache_clear()
        get_sessionmaker.cache_clear()


async def _active_watchlist_ids() -> list[str]:
    from sqlalchemy import select

    from newsradar.db.models import Watchlist

    factory = get_sessionmaker()
    async with factory() as session:
        rows = (
            (await session.execute(select(Watchlist.id).where(Watchlist.active.is_(True))))
            .scalars()
            .all()
        )
    return [str(r) for r in rows]


def _summarize(results: list[RunResult]) -> list[dict[str, Any]]:
    return [
        {
            "connector": r.connector,
            "watchlist_id": str(r.watchlist_id) if r.watchlist_id else None,
            "fetched": r.fetched,
            "inserted": r.inserted,
            "duplicates": r.duplicates,
            "errors": r.errors,
            "status": r.status,
            "duration_ms": r.duration_ms,
        }
        for r in results
    ]


@celery_app.task(name="newsradar.ingest_connector")  # type: ignore[untyped-decorator]
def ingest_connector(connector_name: str, watchlist_id: str) -> list[dict[str, Any]]:
    """Run one connector for one watchlist."""

    results = _run_async(ingest(watchlist_id, connector_name=connector_name))
    return _summarize(results)


@celery_app.task(name="newsradar.ingest_connector_all")  # type: ignore[untyped-decorator]
def ingest_connector_all(connector_name: str) -> list[dict[str, Any]]:
    """Run one connector across every active watchlist (used by the beat schedule)."""

    async def _do() -> list[RunResult]:
        results: list[RunResult] = []
        for wl_id in await _active_watchlist_ids():
            results.extend(await ingest(wl_id, connector_name=connector_name))
        return results

    return _summarize(_run_async(_do()))


@celery_app.task(name="newsradar.ingest_all")  # type: ignore[untyped-decorator]
def ingest_all() -> list[dict[str, Any]]:
    """Run every enabled connector across every active watchlist."""

    async def _do() -> list[RunResult]:
        settings = get_settings()
        enabled = [c.name for c in get_enabled_connectors(settings)]
        results: list[RunResult] = []
        for wl_id in await _active_watchlist_ids():
            for name in enabled:
                results.extend(await ingest(wl_id, connector_name=name))
        return results

    return _summarize(_run_async(_do()))


def _register_beat_schedule() -> None:
    """Populate the (empty in P0) beat schedule with per-connector cadences."""

    known = {cls.name for cls in CONNECTOR_CLASSES}
    for name, interval in BEAT_INTERVALS.items():
        if name not in known:
            continue
        celery_app.conf.beat_schedule[f"ingest-{name}"] = {
            "task": "newsradar.ingest_connector_all",
            "schedule": schedule(run_every=interval),
            "args": (name,),
        }


_register_beat_schedule()
