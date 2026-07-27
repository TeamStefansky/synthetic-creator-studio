"""Alert & report delivery over Slack webhook and SMTP email.

Design rules from the spec:

* **Never fake a send.** With no credentials the channel degrades to a
  ``skipped`` outcome ("not connected") — it does not pretend success and does not
  set ``delivered_at``.
* **Failures are retried 3× with backoff**, then recorded on
  ``alerts.delivery_error``. A failed delivery never raises out of here, so it can
  never crash the pipeline.

Transports are injected (``SlackTransport`` / ``EmailTransport``) so tests exercise
the retry/record logic against fakes without touching the network.
"""

from __future__ import annotations

import asyncio
import datetime as dt
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Literal, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings, get_settings
from newsradar.db.models import Alert
from newsradar.logging import get_logger
from newsradar.signals.rules import alert_summary

log = get_logger(__name__)

DEFAULT_RETRIES = 3
DEFAULT_BACKOFF = 0.5

DeliveryStatus = Literal["sent", "skipped", "failed"]


@dataclass(frozen=True)
class DeliveryOutcome:
    """Result of one delivery attempt on one channel."""

    channel: str
    status: DeliveryStatus
    detail: str | None = None


class SlackTransport(Protocol):
    """Posts a JSON payload to a Slack incoming-webhook URL."""

    async def post(self, url: str, payload: dict[str, object]) -> None: ...


class EmailTransport(Protocol):
    """Sends a prepared :class:`email.message.EmailMessage` via SMTP."""

    async def send(self, settings: Settings, message: EmailMessage) -> None: ...


class HttpxSlackTransport:
    """Production Slack transport (httpx POST)."""

    async def post(self, url: str, payload: dict[str, object]) -> None:
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()


class SmtplibEmailTransport:
    """Production SMTP transport (stdlib smtplib, run off the event loop)."""

    async def send(self, settings: Settings, message: EmailMessage) -> None:
        import smtplib

        def _send() -> None:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.ehlo()
                try:
                    smtp.starttls()
                    smtp.ehlo()
                except smtplib.SMTPException:
                    pass  # server without STARTTLS
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)

        await asyncio.to_thread(_send)


async def _with_retry(
    op: Callable[[], Awaitable[None]],
    *,
    retries: int = DEFAULT_RETRIES,
    backoff_base: float = DEFAULT_BACKOFF,
) -> None:
    """Run ``op`` up to ``retries`` times with exponential backoff; re-raise the last error."""

    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            await op()
            return
        except Exception as exc:  # noqa: BLE001 - retry any transport error
            last_exc = exc
            if attempt < retries - 1:
                await asyncio.sleep(backoff_base * (2**attempt))
    assert last_exc is not None
    raise last_exc


async def deliver_slack(
    session: AsyncSession,
    *,
    text: str,
    settings: Settings,
    transport: SlackTransport,
    alert: Alert | None = None,
    now: dt.datetime,
    retries: int = DEFAULT_RETRIES,
    backoff_base: float = DEFAULT_BACKOFF,
) -> DeliveryOutcome:
    """Deliver a Slack message; degrade to ``skipped`` when no webhook is configured."""

    if not settings.slack_webhook_url:
        return DeliveryOutcome("slack", "skipped", "slack not connected (no webhook url)")

    payload: dict[str, object] = {"text": text}
    try:
        await _with_retry(
            lambda: transport.post(settings.slack_webhook_url, payload),
            retries=retries,
            backoff_base=backoff_base,
        )
    except Exception as exc:  # noqa: BLE001 - a failed delivery must never crash
        detail = f"slack: {exc}"
        log.warning("delivery.slack_failed", error=str(exc))
        if alert is not None:
            alert.delivery_error = detail
            await session.commit()
        return DeliveryOutcome("slack", "failed", detail)

    if alert is not None:
        alert.delivered_at = now
        alert.delivery_error = None
        await session.commit()
    return DeliveryOutcome("slack", "sent")


async def deliver_email(
    session: AsyncSession,
    *,
    subject: str,
    html_body: str | None,
    text_body: str,
    recipients: Sequence[str],
    settings: Settings,
    transport: EmailTransport,
    alert: Alert | None = None,
    now: dt.datetime,
    retries: int = DEFAULT_RETRIES,
    backoff_base: float = DEFAULT_BACKOFF,
) -> DeliveryOutcome:
    """Deliver an email; degrade to ``skipped`` when SMTP is not configured."""

    if not (settings.smtp_host and settings.smtp_from and recipients):
        return DeliveryOutcome("email", "skipped", "smtp not connected (missing host/from/to)")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from
    message["To"] = ", ".join(recipients)
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        await _with_retry(
            lambda: transport.send(settings, message),
            retries=retries,
            backoff_base=backoff_base,
        )
    except Exception as exc:  # noqa: BLE001 - a failed delivery must never crash
        detail = f"email: {exc}"
        log.warning("delivery.email_failed", error=str(exc))
        if alert is not None:
            alert.delivery_error = detail
            await session.commit()
        return DeliveryOutcome("email", "failed", detail)

    if alert is not None:
        alert.delivered_at = now
        alert.delivery_error = None
        await session.commit()
    return DeliveryOutcome("email", "sent")


async def deliver_alert(
    session: AsyncSession,
    alert: Alert,
    *,
    settings: Settings | None = None,
    slack_transport: SlackTransport | None = None,
    now: dt.datetime | None = None,
    retries: int = DEFAULT_RETRIES,
    backoff_base: float = DEFAULT_BACKOFF,
) -> list[DeliveryOutcome]:
    """Dispatch an alert to Slack (the real-time channel). Never raises."""

    settings = settings or get_settings()
    now = now or dt.datetime.now(dt.UTC)
    transport = slack_transport or HttpxSlackTransport()
    text = f"[{alert.severity.value.upper()}] {alert_summary(alert)}"
    outcome = await deliver_slack(
        session,
        text=text,
        settings=settings,
        transport=transport,
        alert=alert,
        now=now,
        retries=retries,
        backoff_base=backoff_base,
    )
    return [outcome]
