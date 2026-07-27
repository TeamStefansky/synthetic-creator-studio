"""Report and report-schedule endpoints, including ad-hoc generation."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import Pagination, get_report_llm, get_session, pagination
from newsradar.api.schemas import (
    GenerateReportIn,
    Page,
    ReportDetailOut,
    ReportScheduleIn,
    ReportScheduleOut,
    ReportSchedulePatch,
    ReportSummaryOut,
)
from newsradar.db.models import Report, ReportFormat, ReportSchedule
from newsradar.llm.client import LLMClient
from newsradar.reports.service import generate_and_store_report

router = APIRouter(tags=["reports"])


def _summary(report: Report) -> ReportSummaryOut:
    out = ReportSummaryOut.model_validate(report)
    out.has_pdf = report.artifact_path is not None
    out.event_ids = list(report.event_ids or [])
    return out


@router.get("/reports", response_model=Page[ReportSummaryOut])
async def list_reports(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
    watchlist_id: uuid.UUID | None = None,
) -> Page[ReportSummaryOut]:
    """List generated reports (newest first), optionally filtered by watchlist."""

    conditions = []
    if watchlist_id is not None:
        conditions.append(Report.watchlist_id == watchlist_id)
    total = (
        await session.execute(select(func.count()).select_from(Report).where(*conditions))
    ).scalar_one()
    rows = (
        (
            await session.execute(
                select(Report)
                .where(*conditions)
                .order_by(Report.generated_at.desc())
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[_summary(r) for r in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/reports/{report_id}", response_model=ReportDetailOut)
async def get_report(
    report_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ReportDetailOut:
    """Return a full report (Hebrew Markdown + HTML + artifact path)."""

    report = await session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    out = ReportDetailOut.model_validate(report)
    out.has_pdf = report.artifact_path is not None
    out.event_ids = list(report.event_ids or [])
    return out


@router.post("/reports/generate", response_model=ReportSummaryOut, status_code=201)
async def generate_report(
    body: GenerateReportIn,
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_report_llm),
) -> ReportSummaryOut:
    """Generate a report ad hoc (synchronous) and return its summary."""

    run = await generate_and_store_report(
        session,
        llm,
        watchlist_id=body.watchlist_id,
        lookback_hours=body.lookback_hours,
        sections=body.sections,
        deliver=False,
    )
    report = await session.get(Report, run.report_id)
    assert report is not None
    return _summary(report)


# ------------------------------------------------------------------ schedules


@router.get("/report-schedules", response_model=Page[ReportScheduleOut])
async def list_schedules(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[ReportScheduleOut]:
    """List report schedules."""

    total = (await session.execute(select(func.count()).select_from(ReportSchedule))).scalar_one()
    rows = (
        (
            await session.execute(
                select(ReportSchedule)
                .order_by(ReportSchedule.name)
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[ReportScheduleOut.model_validate(s) for s in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.post("/report-schedules", response_model=ReportScheduleOut, status_code=201)
async def create_schedule(
    body: ReportScheduleIn,
    session: AsyncSession = Depends(get_session),
) -> ReportScheduleOut:
    """Create a report schedule."""

    sched = ReportSchedule(
        watchlist_id=body.watchlist_id,
        name=body.name,
        cron=body.cron,
        timezone=body.timezone,
        sections=body.sections,
        recipients=body.recipients,
        format=ReportFormat(body.format),
        lookback_hours=body.lookback_hours,
        active=body.active,
    )
    session.add(sched)
    await session.commit()
    await session.refresh(sched)
    return ReportScheduleOut.model_validate(sched)


@router.patch("/report-schedules/{schedule_id}", response_model=ReportScheduleOut)
async def update_schedule(
    schedule_id: uuid.UUID,
    body: ReportSchedulePatch,
    session: AsyncSession = Depends(get_session),
) -> ReportScheduleOut:
    """Partially update a report schedule."""

    sched = await session.get(ReportSchedule, schedule_id)
    if sched is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key == "format" and value is not None:
            sched.format = ReportFormat(value)
        else:
            setattr(sched, key, value)
    await session.commit()
    await session.refresh(sched)
    return ReportScheduleOut.model_validate(sched)
