"""Celery application: Redis broker + result backend, one ``ping`` task.

The beat schedule is intentionally empty in Phase 0; later phases register periodic
jobs by adding entries to ``celery_app.conf.beat_schedule``.
"""

from __future__ import annotations

from typing import Any

from celery import Celery

from newsradar.config import get_settings

settings = get_settings()

celery_app = Celery(
    "newsradar",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Jerusalem",
    enable_utc=True,
    task_track_started=True,
)

# Empty beat schedule — later phases populate this dict.
celery_app.conf.beat_schedule = {}


@celery_app.task(name="newsradar.ping")  # type: ignore[untyped-decorator]
def ping() -> str:
    """Trivial liveness task used to verify the worker/broker wiring."""

    return "pong"


@celery_app.task(name="newsradar.debug")  # type: ignore[untyped-decorator]
def debug(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Echo back its payload; useful for smoke-testing task dispatch."""

    return {"received": payload or {}}
