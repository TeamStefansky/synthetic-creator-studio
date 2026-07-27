"""End-to-end signal cycle: a heat spike fires a critical, delivered, de-duped alert."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings
from newsradar.db.models import Alert, AlertSeverity, EventMetric
from newsradar.signals import weights as w
from newsradar.signals.metrics import run_signal_cycle, store_event_metrics
from tests.signals import _factories as f

NOW = dt.datetime(2026, 7, 27, 12, 5, tzinfo=dt.UTC)


class _FakeSlack:
    def __init__(self) -> None:
        self.payloads: list[dict[str, object]] = []

    async def post(self, url: str, payload: dict[str, object]) -> None:
        self.payloads.append(payload)


async def _seed_spiking_event(session: AsyncSession) -> object:
    wl = await f.make_watchlist(session)
    ev = await f.make_event(
        session, wl, first_seen_at=NOW - dt.timedelta(hours=8), last_seen_at=NOW
    )
    # Warm-up: 7 hourly buckets, 1 doc each, single source (builds acceleration history).
    warm = await f.make_source(session, "warm.com", tier=2, source_type="news")
    for h in range(7, 0, -1):
        d = await f.make_document(session, warm, published_at=NOW - dt.timedelta(hours=h))
        await f.add_match(session, d, wl, ["x"])
        await f.link_doc(session, ev, d)
    # Burst: 20 docs from 20 distinct sources (mixed tiers + types) in the current hour.
    for i in range(20):
        tier = 1 if i % 3 == 0 else 2
        stype = "social" if i % 2 == 0 else "news"
        src = await f.make_source(session, f"burst{i}.com", tier=tier, source_type=stype)
        d = await f.make_document(session, src, published_at=NOW - dt.timedelta(minutes=3))
        await f.add_match(session, d, wl, ["x"])
        await f.link_doc(session, ev, d)
    ev.doc_count = 27
    ev.source_count = 21
    await session.commit()
    return wl, ev


@pytest.mark.asyncio
async def test_metrics_written_once_per_bucket(session: AsyncSession) -> None:
    await f.reset(session)
    wl, ev = await _seed_spiking_event(session)

    await store_event_metrics(session, wl.id, now=NOW)
    await store_event_metrics(session, wl.id, now=NOW + dt.timedelta(minutes=10))

    # Two runs in the same hour -> a single upserted bucket row.
    count = (
        await session.execute(
            select(func.count()).select_from(EventMetric).where(EventMetric.event_id == ev.id)
        )
    ).scalar_one()
    assert count == 1
    metric = (
        await session.execute(select(EventMetric).where(EventMetric.event_id == ev.id))
    ).scalar_one()
    assert metric.heat_score is not None and metric.heat_score >= w.HEAT_CRITICAL


@pytest.mark.asyncio
async def test_spike_fires_critical_alert_and_dispatches_slack(session: AsyncSession) -> None:
    await f.reset(session)
    wl, ev = await _seed_spiking_event(session)

    slack = _FakeSlack()
    settings = Settings(slack_webhook_url="https://hooks.example/xyz")
    result = await run_signal_cycle(
        session, wl.id, now=NOW, settings=settings, slack_transport=slack
    )

    assert "heat_spike" in result.alerts_fired
    alert = (
        await session.execute(
            select(Alert).where(Alert.event_id == ev.id, Alert.rule_name == "heat_spike")
        )
    ).scalar_one()
    assert alert.severity == AlertSeverity.critical
    assert alert.delivered_at == NOW
    # A Slack payload was actually dispatched (against the fake webhook catcher).
    assert slack.payloads and "CRITICAL" in str(slack.payloads[0])


@pytest.mark.asyncio
async def test_cooldown_second_cycle_no_duplicate_alert(session: AsyncSession) -> None:
    await f.reset(session)
    wl, ev = await _seed_spiking_event(session)
    settings = Settings(slack_webhook_url="https://hooks.example/xyz")

    first = await run_signal_cycle(
        session, wl.id, now=NOW, settings=settings, slack_transport=_FakeSlack()
    )
    assert "heat_spike" in first.alerts_fired

    second = await run_signal_cycle(
        session,
        wl.id,
        now=NOW + dt.timedelta(minutes=30),
        settings=settings,
        slack_transport=_FakeSlack(),
    )
    assert "heat_spike" not in second.alerts_fired

    total = (
        await session.execute(
            select(func.count())
            .select_from(Alert)
            .where(Alert.event_id == ev.id, Alert.rule_name == "heat_spike")
        )
    ).scalar_one()
    assert total == 1
