"""Celery application (queue layer).

Generation and publishing are long-running and run as Celery tasks against
Redis in production. The app is defined here; importing it requires Celery but
not a running broker. Tasks live in ``workers.tasks``.
"""
from __future__ import annotations

from app.config import get_settings

try:
    from celery import Celery

    _settings = get_settings()
    celery_app = Celery(
        "synthetic_creator_studio",
        broker=_settings.broker_url,
        backend=_settings.result_backend,
    )
    celery_app.conf.update(task_track_started=True, task_serializer="json", result_serializer="json")
except Exception:  # pragma: no cover - celery optional in some envs
    celery_app = None
