"""Report service + due-schedule task: generation, delivery, missed-window collapse."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings
from newsradar.db.models import Report, ReportFormat, ReportSchedule
from newsradar.llm.client import FakeLLMClient
from newsradar.reports.service import generate_and_store_report
from newsradar.tasks.report import run_due_schedules
from tests.reports.test_builder import NOW, SECTIONS, _seed
from tests.reports.test_renderer import _responder

SECTIONS_LIST = SECTIONS


@pytest.mark.asyncio
async def test_generate_and_store_report(session: AsyncSession) -> None:
    wl, _ev, _entity = await _seed(session)
    llm = FakeLLMClient(_responder)
    run = await generate_and_store_report(
        session,
        llm,
        watchlist_id=wl.id,
        lookback_hours=24,
        sections=SECTIONS_LIST,
        now=NOW,
        render_pdf=False,
        deliver=False,
    )
    assert run.report_id is not None
    report = await session.get(Report, run.report_id)
    assert report is not None and report.markdown
    assert run.input_tokens > 0


@pytest.mark.asyncio
async def test_scheduled_report_generates_once_and_stamps(session: AsyncSession) -> None:
    wl, _ev, _entity = await _seed(session)
    sched = ReportSchedule(
        watchlist_id=wl.id,
        name="daily-7am",
        cron="0 7 * * *",
        timezone="Asia/Jerusalem",
        sections=SECTIONS_LIST,
        recipients={"email": ["editor@example.com"]},
        format=ReportFormat.markdown,
        lookback_hours=24,
        active=True,
        last_run_at=NOW - dt.timedelta(days=4),  # long backlog
    )
    session.add(sched)
    await session.commit()

    llm = FakeLLMClient(_responder)
    # Deliver with no creds -> degrades to skipped, never crashes.
    generated = await run_due_schedules(session, now=NOW, llm=llm, render_pdf=False, deliver=True)
    assert len(generated) == 1

    await session.refresh(sched)
    assert sched.last_run_at == NOW

    # Running again immediately: the window already ran -> nothing new (collapse).
    generated2 = await run_due_schedules(
        session, now=NOW + dt.timedelta(minutes=1), llm=llm, render_pdf=False, deliver=True
    )
    assert generated2 == []

    total = (
        await session.execute(
            select(func.count()).select_from(Report).where(Report.watchlist_id == wl.id)
        )
    ).scalar_one()
    assert total == 1


@pytest.mark.asyncio
async def test_report_delivery_email_skipped_without_smtp(session: AsyncSession) -> None:
    wl, _ev, _entity = await _seed(session)
    llm = FakeLLMClient(_responder)
    run = await generate_and_store_report(
        session,
        llm,
        watchlist_id=wl.id,
        lookback_hours=24,
        sections=SECTIONS_LIST,
        now=NOW,
        render_pdf=False,
        deliver=True,
        recipients={"email": ["editor@example.com"]},
        settings=Settings(smtp_host="", slack_webhook_url=""),
    )
    # No transports configured -> nothing delivered, but generation still succeeded.
    assert all(o.status == "skipped" for o in run.deliveries) or run.deliveries == []
