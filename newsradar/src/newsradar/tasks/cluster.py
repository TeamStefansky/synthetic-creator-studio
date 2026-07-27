"""Celery reclustering tasks — nightly HDBSCAN drift repair per watchlist.

Registered on the beat schedule (03:00 Asia/Jerusalem) by ``tasks/enrich.py``.
"""

from __future__ import annotations

import uuid
from typing import Any

from newsradar.logging import get_logger
from newsradar.pipeline import cluster as cluster_pipeline
from newsradar.pipeline.run import active_watchlist_ids
from newsradar.tasks.celery_app import celery_app
from newsradar.tasks.enrich import _run_async

log = get_logger(__name__)


@celery_app.task(name="newsradar.recluster_watchlist")  # type: ignore[untyped-decorator]
def recluster_watchlist(watchlist_id: str) -> dict[str, Any]:
    """Nightly drift repair for one watchlist."""

    async def _do() -> int:
        factory = _sessionmaker()
        async with factory() as session:
            return await cluster_pipeline.recluster_watchlist(
                session, watchlist_id=uuid.UUID(watchlist_id)
            )

    return {"watchlist_id": watchlist_id, "merged": _run_async(_do())}


@celery_app.task(name="newsradar.recluster_all")  # type: ignore[untyped-decorator]
def recluster_all() -> list[dict[str, Any]]:
    """Recluster every active watchlist (beat: nightly)."""

    async def _do() -> list[tuple[str, int]]:
        factory = _sessionmaker()
        out: list[tuple[str, int]] = []
        for wl_id in await active_watchlist_ids():
            async with factory() as session:
                merged = await cluster_pipeline.recluster_watchlist(
                    session, watchlist_id=uuid.UUID(str(wl_id))
                )
            out.append((str(wl_id), merged))
        return out

    return [{"watchlist_id": wl, "merged": m} for wl, m in _run_async(_do())]


def _sessionmaker() -> Any:
    from newsradar.db.session import get_sessionmaker

    return get_sessionmaker()
