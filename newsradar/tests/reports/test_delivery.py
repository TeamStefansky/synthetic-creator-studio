"""Delivery: degrade to 'not connected', retry with backoff, record delivery_error."""

from __future__ import annotations

import datetime as dt
from email.message import EmailMessage

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings
from newsradar.reports.delivery import (
    DeliveryOutcome,
    deliver_alert,
    deliver_email,
    deliver_slack,
)
from newsradar.signals.rules import heat_spike, record_alert
from tests.signals import _factories as f

NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)


class _RecordingSlack:
    def __init__(self, fail_times: int = 0) -> None:
        self.calls: list[dict[str, object]] = []
        self._fail_times = fail_times

    async def post(self, url: str, payload: dict[str, object]) -> None:
        self.calls.append({"url": url, "payload": payload})
        if len(self.calls) <= self._fail_times:
            raise RuntimeError("boom")


class _RecordingEmail:
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, settings: Settings, message: EmailMessage) -> None:
        self.sent.append(message)


@pytest.mark.asyncio
async def test_slack_skipped_when_not_connected(session: AsyncSession) -> None:
    settings = Settings(slack_webhook_url="")
    transport = _RecordingSlack()
    outcome = await deliver_slack(
        session, text="hi", settings=settings, transport=transport, now=NOW
    )
    assert outcome == DeliveryOutcome("slack", "skipped", outcome.detail)
    assert outcome.status == "skipped"
    assert transport.calls == []  # never faked a send


@pytest.mark.asyncio
async def test_email_skipped_when_not_connected(session: AsyncSession) -> None:
    settings = Settings(smtp_host="", smtp_from="")
    transport = _RecordingEmail()
    outcome = await deliver_email(
        session,
        subject="s",
        html_body=None,
        text_body="body",
        recipients=["a@b.com"],
        settings=settings,
        transport=transport,
        now=NOW,
    )
    assert outcome.status == "skipped"
    assert transport.sent == []


@pytest.mark.asyncio
async def test_alert_delivered_and_stamped(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)
    alert = await record_alert(
        session, heat_spike(event_id=ev.id, current_heat=90.0, prev_heat=10.0), now=NOW
    )
    assert alert is not None

    settings = Settings(slack_webhook_url="https://hooks.example/xyz")
    transport = _RecordingSlack()
    outcomes = await deliver_alert(
        session, alert, settings=settings, slack_transport=transport, now=NOW
    )
    assert [o.status for o in outcomes] == ["sent"]
    assert alert.delivered_at == NOW
    assert alert.delivery_error is None
    assert len(transport.calls) == 1
    assert "CRITICAL" in str(transport.calls[0]["payload"])


@pytest.mark.asyncio
async def test_retry_then_success(session: AsyncSession) -> None:
    settings = Settings(slack_webhook_url="https://hooks.example/xyz")
    transport = _RecordingSlack(fail_times=2)  # fail twice, succeed on the 3rd
    outcome = await deliver_slack(
        session, text="hi", settings=settings, transport=transport, now=NOW, backoff_base=0.0
    )
    assert outcome.status == "sent"
    assert len(transport.calls) == 3


@pytest.mark.asyncio
async def test_failure_records_delivery_error_without_crashing(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)
    alert = await record_alert(
        session, heat_spike(event_id=ev.id, current_heat=90.0, prev_heat=10.0), now=NOW
    )
    assert alert is not None

    settings = Settings(slack_webhook_url="https://hooks.example/xyz")
    transport = _RecordingSlack(fail_times=99)  # always fails
    outcome = await deliver_slack(
        session,
        text="hi",
        settings=settings,
        transport=transport,
        alert=alert,
        now=NOW,
        backoff_base=0.0,
    )
    assert outcome.status == "failed"
    assert len(transport.calls) == 3  # exactly 3 attempts
    assert alert.delivery_error is not None and "boom" in alert.delivery_error
    assert alert.delivered_at is None
