"""Celery metrics/alerts task — the 10-minute signal cycle per watchlist.

Registered on the beat schedule (every 10 minutes). Thin sync wrapper around the
async :func:`newsradar.signals.metrics.run_signal_cycle`, following the project's
``asyncio.run`` convention (see ``tasks/enrich.py``).
"""

from __future__ import annotations

import uuid
from typing import Any

from celery.schedules import schedule

from newsradar.logging import get_logger
from newsradar.pipeline.run import active_watchlist_ids
from newsradar.signals.metrics import run_signal_cycle
from newsradar.tasks.celery_app import celery_app
from newsradar.tasks.enrich import _run_async

log = get_logger(__name__)

METRICS_INTERVAL_SECONDS = 10 * 60


def _sessionmaker() -> Any:
    from newsradar.db.session import get_sessionmaker

    return get_sessionmaker()


@celery_app.task(name="newsradar.signal_cycle_watchlist")  # type: ignore[untyped-decorator]
def signal_cycle_watchlist(watchlist_id: str) -> dict[str, Any]:
    """Run one signal cycle (metrics + trends + alerts + delivery) for a watchlist."""

    async def _do() -> dict[str, Any]:
        factory = _sessionmaker()
        async with factory() as session:
            res = await run_signal_cycle(session, uuid.UUID(watchlist_id))
            return {
                "watchlist_id": watchlist_id,
                "metrics_written": res.metrics_written,
                "alerts_fired": res.alerts_fired,
                "trends_detected": res.trends_detected,
            }

    return _run_async(_do())


@celery_app.task(name="newsradar.signal_cycle_all")  # type: ignore[untyped-decorator]
def signal_cycle_all() -> list[dict[str, Any]]:
    """Run the signal cycle across every active watchlist (beat: every 10 minutes)."""

    async def _do() -> list[dict[str, Any]]:
        factory = _sessionmaker()
        out: list[dict[str, Any]] = []
        for wl_id in await active_watchlist_ids():
            async with factory() as session:
                res = await run_signal_cycle(session, uuid.UUID(str(wl_id)))
            out.append(
                {
                    "watchlist_id": str(wl_id),
                    "metrics_written": res.metrics_written,
                    "alerts_fired": res.alerts_fired,
                    "trends_detected": res.trends_detected,
                }
            )
        return out

    return _run_async(_do())


def _register_metrics_beat() -> None:
    celery_app.conf.beat_schedule["signal-cycle"] = {
        "task": "newsradar.signal_cycle_all",
        "schedule": schedule(run_every=METRICS_INTERVAL_SECONDS),
    }


_register_metrics_beat()
