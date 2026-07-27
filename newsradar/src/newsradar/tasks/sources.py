"""Celery task for batch source onboarding (P5).

Discovery + subscription runs off-request: ``POST /sources/batch`` creates the
job row and dispatches this task, which returns a job id immediately.
"""

from __future__ import annotations

import asyncio
import contextlib
import uuid
from collections.abc import Awaitable
from typing import Any

from newsradar.db.session import get_engine, get_sessionmaker
from newsradar.feeds.batch import process_batch
from newsradar.logging import get_logger
from newsradar.tasks.celery_app import celery_app

log = get_logger(__name__)


def _run_async[T](coro: Awaitable[T]) -> T:
    try:
        return asyncio.run(coro)  # type: ignore[arg-type]
    finally:
        with contextlib.suppress(Exception):
            asyncio.run(get_engine().dispose())
        get_engine.cache_clear()
        get_sessionmaker.cache_clear()


@celery_app.task(name="newsradar.import_sources")  # type: ignore[untyped-decorator]
def import_sources(job_id: str, lines: list[str]) -> dict[str, Any]:
    """Discover feeds for ``lines`` and subscribe, recording per-line results."""

    async def _do() -> None:
        await process_batch(get_sessionmaker(), uuid.UUID(job_id), lines)

    _run_async(_do())
    return {"job_id": job_id, "lines": len(lines)}
