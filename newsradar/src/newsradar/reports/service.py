"""Report generation service — one entry point shared by the API and the beat task.

Builds the context (no LLM), renders it (one Sonnet call), persists the ``reports``
row, and optionally delivers it (email + Slack). Providers are injected so tests
run against the fake LLM and fake transports.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings, get_settings
from newsradar.llm.client import LLMClient
from newsradar.logging import get_logger
from newsradar.reports.builder import build_report_context
from newsradar.reports.delivery import (
    DeliveryOutcome,
    EmailTransport,
    SlackTransport,
    deliver_email,
    deliver_slack,
)
from newsradar.reports.renderer import persist_report, render_report

log = get_logger(__name__)


@dataclass
class ReportRun:
    """Result of one report generation."""

    report_id: uuid.UUID
    input_tokens: int
    output_tokens: int
    model: str
    deliveries: list[DeliveryOutcome] = field(default_factory=list)


def _recipient_emails(recipients: dict[str, object] | None) -> list[str]:
    if not recipients:
        return []
    emails = recipients.get("email")
    if isinstance(emails, str):
        return [emails]
    if isinstance(emails, list):
        return [str(e) for e in emails]
    return []


async def generate_and_store_report(
    session: AsyncSession,
    llm: LLMClient,
    *,
    watchlist_id: uuid.UUID,
    lookback_hours: int,
    sections: list[str],
    schedule_id: uuid.UUID | None = None,
    recipients: dict[str, object] | None = None,
    now: dt.datetime | None = None,
    deliver: bool = False,
    render_pdf: bool = True,
    settings: Settings | None = None,
    slack_transport: SlackTransport | None = None,
    email_transport: EmailTransport | None = None,
) -> ReportRun:
    """Build, render, persist and optionally deliver a report. Returns the run summary."""

    now = now or dt.datetime.now(dt.UTC)
    settings = settings or get_settings()

    context = await build_report_context(
        session,
        watchlist_id=watchlist_id,
        lookback_hours=lookback_hours,
        sections=sections,
        now=now,
    )
    rendered = await render_report(session, llm, context, render_pdf=render_pdf)
    report_id = await persist_report(session, context, rendered, schedule_id=schedule_id, now=now)

    deliveries: list[DeliveryOutcome] = []
    if deliver:
        subject = f"NewsRadar — {context.watchlist_name} ({now.date().isoformat()})"
        emails = _recipient_emails(recipients)
        if email_transport is not None or settings.smtp_host:
            from newsradar.reports.delivery import SmtplibEmailTransport

            deliveries.append(
                await deliver_email(
                    session,
                    subject=subject,
                    html_body=rendered.html,
                    text_body=rendered.markdown,
                    recipients=emails,
                    settings=settings,
                    transport=email_transport or SmtplibEmailTransport(),
                    now=now,
                )
            )
        if slack_transport is not None or settings.slack_webhook_url:
            from newsradar.reports.delivery import HttpxSlackTransport

            deliveries.append(
                await deliver_slack(
                    session,
                    text=f"{subject} — report {report_id} ready",
                    settings=settings,
                    transport=slack_transport or HttpxSlackTransport(),
                    now=now,
                )
            )

    log.info(
        "report.generated",
        watchlist=str(watchlist_id),
        report_id=str(report_id),
        input_tokens=rendered.input_tokens,
        output_tokens=rendered.output_tokens,
    )
    return ReportRun(
        report_id=report_id,
        input_tokens=rendered.input_tokens,
        output_tokens=rendered.output_tokens,
        model=rendered.model,
        deliveries=deliveries,
    )
