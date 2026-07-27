"""Headline-digest service — build, translate, render, persist, deliver (P6).

Shared by the API (ad-hoc) and the beat task. Translation is scoped to the
digest's own headline documents (never the corpus), runs before the context is
built, and reuses the cached translation layer. Delivery reuses
``reports/delivery.py`` (email + Slack) with retry and ``delivery_error``.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings, get_settings
from newsradar.db.models import (
    Report,
    ReportFormat,
    ReportSchedule,
    ReportType,
    Watchlist,
    WatchlistKind,
)
from newsradar.llm.client import LLMClient
from newsradar.logging import get_logger
from newsradar.reports.delivery import (
    DeliveryOutcome,
    EmailTransport,
    SlackTransport,
    deliver_email,
)
from newsradar.reports.digest_builder import build_digest_context, digest_document_ids
from newsradar.reports.digest_renderer import render_digest
from newsradar.reports.service import _recipient_emails
from newsradar.translate.service import translate_documents

log = get_logger(__name__)


@dataclass
class DigestRun:
    report_id: uuid.UUID
    total_headlines: int
    input_tokens: int
    output_tokens: int
    model: str
    translation_docs: int = 0
    deliveries: list[DeliveryOutcome] = field(default_factory=list)


DIGEST_SCHEDULE_NAME = "Daily headline digest"


async def ensure_digest_schedule(
    session: AsyncSession, *, watchlist_id: uuid.UUID, hour: int | None = None
) -> ReportSchedule:
    """Idempotently seed the 07:00 Asia/Jerusalem headline-digest schedule (24h)."""

    hour = hour if hour is not None else get_settings().digest_hour
    existing = (
        await session.execute(
            select(ReportSchedule).where(ReportSchedule.name == DIGEST_SCHEDULE_NAME)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    sched = ReportSchedule(
        watchlist_id=watchlist_id,
        name=DIGEST_SCHEDULE_NAME,
        cron=f"0 {hour} * * *",
        timezone="Asia/Jerusalem",
        format=ReportFormat.html,
        report_type=ReportType.headline_digest,
        lookback_hours=24,
        active=True,
    )
    session.add(sched)
    await session.commit()
    return sched


async def _primary_watchlist_id(session: AsyncSession) -> uuid.UUID | None:
    return (
        await session.execute(
            select(Watchlist.id)
            .where(Watchlist.kind == WatchlistKind.interest, Watchlist.active.is_(True))
            .order_by(Watchlist.name)
            .limit(1)
        )
    ).scalar_one_or_none()


async def generate_and_store_digest(
    session: AsyncSession,
    llm: LLMClient,
    *,
    lookback_hours: int,
    now: dt.datetime | None = None,
    schedule_id: uuid.UUID | None = None,
    recipients: dict[str, object] | None = None,
    watchlist_id: uuid.UUID | None = None,
    deliver: bool = False,
    render_pdf: bool = True,
    settings: Settings | None = None,
    email_transport: EmailTransport | None = None,
    slack_transport: SlackTransport | None = None,
) -> DigestRun:
    """Build, translate, render, persist and optionally deliver a headline digest."""

    now = now or dt.datetime.now(dt.UTC)
    settings = settings or get_settings()
    target_lang = settings.reader_target_lang

    watchlist_id = watchlist_id or await _primary_watchlist_id(session)
    if watchlist_id is None:
        raise ValueError("no active interest exists to anchor the digest report")

    # Translation is scoped to the digest's headline documents only, before build.
    doc_ids = await digest_document_ids(session, lookback_hours=lookback_hours, now=now)
    summary = await translate_documents(session, llm, doc_ids, target_lang=target_lang)

    context = await build_digest_context(
        session, lookback_hours=lookback_hours, now=now, target_lang=target_lang
    )
    rendered = await render_digest(session, llm, context, render_pdf=render_pdf)

    report = Report(
        watchlist_id=watchlist_id,
        schedule_id=schedule_id,
        report_type=ReportType.headline_digest,
        period_start=context.period_start,
        period_end=context.period_end,
        markdown=rendered.markdown,
        html=rendered.html,
        artifact_path=rendered.artifact_path,
        model=rendered.model,
        input_tokens=rendered.input_tokens,
        output_tokens=rendered.output_tokens,
    )
    report.generated_at = now
    session.add(report)
    await session.commit()

    deliveries: list[DeliveryOutcome] = []
    if deliver:
        emails = _recipient_emails(recipients)
        if email_transport is not None or settings.smtp_host:
            from newsradar.reports.delivery import SmtplibEmailTransport

            deliveries.append(
                await deliver_email(
                    session,
                    subject=f"NewsRadar — Headline digest ({now.date().isoformat()})",
                    html_body=rendered.html,
                    text_body=rendered.markdown,
                    recipients=emails,
                    settings=settings,
                    transport=email_transport or SmtplibEmailTransport(),
                    now=now,
                )
            )

    log.info(
        "digest.generated",
        report_id=str(report.id),
        headlines=context.total_headlines,
        translation_docs=summary.documents_translated,
    )
    return DigestRun(
        report_id=report.id,
        total_headlines=context.total_headlines,
        input_tokens=rendered.input_tokens,
        output_tokens=rendered.output_tokens,
        model=rendered.model,
        translation_docs=summary.documents_translated,
        deliveries=deliveries,
    )
