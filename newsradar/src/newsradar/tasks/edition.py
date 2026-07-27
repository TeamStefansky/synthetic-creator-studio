"""Celery beat task: build a fresh immutable edition every N minutes (P6).

Editions are never mutated after creation; each run appends a new snapshot and
``current`` is simply the most recent. Interval is ``EDITION_INTERVAL_MINUTES``.
"""

from __future__ import annotations

from typing import Any

from celery.schedules import schedule

from newsradar.config import get_settings
from newsradar.llm.client import default_llm_client
from newsradar.logging import get_logger
from newsradar.site.edition import build_edition
from newsradar.tasks.celery_app import celery_app
from newsradar.tasks.enrich import _run_async

log = get_logger(__name__)


@celery_app.task(name="newsradar.build_edition")  # type: ignore[untyped-decorator]
def build_edition_task() -> dict[str, Any]:
    """Beat task: build one new edition and return its id + item count."""

    async def _do() -> tuple[str, int]:
        from newsradar.db.session import get_sessionmaker

        factory = get_sessionmaker()
        async with factory() as session:
            edition = await build_edition(session, default_llm_client())
            return str(edition.id), edition.item_count

    edition_id, items = _run_async(_do())
    return {"edition_id": edition_id, "items": items}


def _register_edition_beat() -> None:
    minutes = get_settings().edition_interval_minutes
    celery_app.conf.beat_schedule["edition-builder"] = {
        "task": "newsradar.build_edition",
        "schedule": schedule(run_every=minutes * 60),
    }


_register_edition_beat()
