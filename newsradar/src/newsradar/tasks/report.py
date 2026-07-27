"""Celery report task — beat reads schedules, generates due reports, stamps runs.

Runs every 5 minutes. For each active schedule it asks :func:`next_due` whether a
scheduled window has passed since ``last_run_at`` (in the schedule's timezone); a
backlog of missed windows collapses to a single run. Generation, rendering and
delivery go through the shared :func:`generate_and_store_report` service; on
success ``last_run_at`` is stamped so the same window never regenerates.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from celery.schedules import schedule
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import ReportSchedule
from newsradar.llm.client import LLMClient, default_llm_client
from newsradar.logging import get_logger
from newsradar.reports.scheduling import next_due
from newsradar.reports.service import generate_and_store_report
from newsradar.tasks.celery_app import celery_app
from newsradar.tasks.enrich import _run_async

log = get_logger(__name__)

REPORT_CHECK_INTERVAL_SECONDS = 5 * 60
DEFAULT_SECTIONS = ["overview", "hot_events", "trends", "negative_coverage", "geo"]


def _sessionmaker() -> Any:
    from newsradar.db.session import get_sessionmaker

    return get_sessionmaker()


async def run_due_schedules(
    session: AsyncSession,
    *,
    now: dt.datetime | None = None,
    llm: LLMClient | None = None,
    deliver: bool = True,
    render_pdf: bool = True,
) -> list[str]:
    """Generate reports for all schedules whose window is due. Returns report ids."""

    now = now or dt.datetime.now(dt.UTC)
    llm = llm or default_llm_client()
    schedules = list(
        (await session.execute(select(ReportSchedule).where(ReportSchedule.active.is_(True))))
        .scalars()
        .all()
    )

    generated: list[str] = []
    for sched in schedules:
        due_at = next_due(sched.cron, sched.timezone, sched.last_run_at, now)
        if due_at is None:
            continue
        try:
            run = await generate_and_store_report(
                session,
                llm,
                watchlist_id=sched.watchlist_id,
                lookback_hours=sched.lookback_hours,
                sections=list(sched.sections or DEFAULT_SECTIONS),
                schedule_id=sched.id,
                recipients=sched.recipients,
                now=now,
                deliver=deliver,
                render_pdf=render_pdf,
            )
        except Exception as exc:  # noqa: BLE001 - one bad schedule must not stall others
            log.warning("report.schedule_failed", schedule_id=str(sched.id), error=str(exc))
            continue
        sched.last_run_at = now
        await session.commit()
        generated.append(str(run.report_id))

    return generated


@celery_app.task(name="newsradar.run_due_reports")  # type: ignore[untyped-decorator]
def run_due_reports() -> dict[str, Any]:
    """Beat task (every 5 min): generate any due scheduled reports."""

    async def _do() -> list[str]:
        factory = _sessionmaker()
        async with factory() as session:
            return await run_due_schedules(session)

    return {"generated": _run_async(_do())}


@celery_app.task(name="newsradar.generate_report_now")  # type: ignore[untyped-decorator]
def generate_report_now(
    watchlist_id: str, lookback_hours: int = 24, sections: list[str] | None = None
) -> dict[str, Any]:
    """Ad-hoc report generation (used by the API POST /reports/generate)."""

    async def _do() -> str:
        factory = _sessionmaker()
        async with factory() as session:
            run = await generate_and_store_report(
                session,
                default_llm_client(),
                watchlist_id=uuid.UUID(watchlist_id),
                lookback_hours=lookback_hours,
                sections=sections or DEFAULT_SECTIONS,
                deliver=False,
            )
            return str(run.report_id)

    return {"report_id": _run_async(_do())}


def _register_report_beat() -> None:
    celery_app.conf.beat_schedule["report-scheduler"] = {
        "task": "newsradar.run_due_reports",
        "schedule": schedule(run_every=REPORT_CHECK_INTERVAL_SECONDS),
    }


_register_report_beat()
