"""Alert rules: threshold/crossing semantics, severity, and cooldown de-dup."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Alert, AlertSeverity
from newsradar.signals.rules import (
    heat_spike,
    negative_surge,
    new_trend,
    record_alert,
    tier1_pickup,
)
from newsradar.signals.trends import TrendResult
from tests.signals import _factories as f

EID = uuid.UUID(int=42)
NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)


def test_heat_spike_crossing_semantics() -> None:
    # Upward crossing of 70 -> warning.
    a = heat_spike(event_id=EID, current_heat=72.0, prev_heat=60.0)
    assert a is not None and a.severity == AlertSeverity.warning
    # Upward crossing of 85 -> critical (even from below 70).
    b = heat_spike(event_id=EID, current_heat=90.0, prev_heat=50.0)
    assert b is not None and b.severity == AlertSeverity.critical
    # Already above the warning line -> no re-fire.
    assert heat_spike(event_id=EID, current_heat=75.0, prev_heat=72.0) is None
    # Falling -> nothing.
    assert heat_spike(event_id=EID, current_heat=40.0, prev_heat=90.0) is None


def test_negative_surge_requires_both_conditions() -> None:
    ok = negative_surge(
        event_id=EID,
        entity_id=uuid.UUID(int=1),
        entity_name="Mayor",
        negative_doc_count=6,
        negativity_index=0.7,
    )
    assert ok is not None and ok.severity == AlertSeverity.critical
    # Enough docs but not negative enough.
    assert (
        negative_surge(
            event_id=EID,
            entity_id=uuid.UUID(int=1),
            entity_name="Mayor",
            negative_doc_count=6,
            negativity_index=0.4,
        )
        is None
    )
    # Negative enough but too few docs.
    assert (
        negative_surge(
            event_id=EID,
            entity_id=uuid.UUID(int=1),
            entity_name="Mayor",
            negative_doc_count=3,
            negativity_index=0.9,
        )
        is None
    )


def test_tier1_pickup() -> None:
    assert tier1_pickup(event_id=EID, had_tier1=False, has_tier1=True) is not None
    assert tier1_pickup(event_id=EID, had_tier1=True, has_tier1=True) is None
    assert tier1_pickup(event_id=EID, had_tier1=False, has_tier1=False) is None


def _trend(lift: float, is_new: bool, reps: list[uuid.UUID]) -> TrendResult:
    return TrendResult(
        term="crisis",
        term_kind="topic",
        current_share=0.2,
        baseline_share=0.05,
        lift=lift,
        doc_count=10,
        source_count=5,
        representative_event_ids=reps,
        is_new=is_new,
    )


def test_new_trend_rule() -> None:
    ok = new_trend(trend=_trend(4.0, True, [EID]))
    assert ok is not None and ok.severity == AlertSeverity.info and ok.event_id == EID
    # Not new.
    assert new_trend(trend=_trend(4.0, False, [EID])) is None
    # Lift below threshold.
    assert new_trend(trend=_trend(2.5, True, [EID])) is None
    # No representative event to anchor to.
    assert new_trend(trend=_trend(4.0, True, [])) is None


@pytest.mark.asyncio
async def test_cooldown_dedup(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)

    first = await record_alert(
        session,
        heat_spike(event_id=ev.id, current_heat=88.0, prev_heat=50.0),
        now=NOW,
    )
    assert first is not None and first.fired_at == NOW

    # Same rule again 1h later -> suppressed by the 6h cooldown.
    second = await record_alert(
        session,
        heat_spike(event_id=ev.id, current_heat=90.0, prev_heat=50.0),
        now=NOW + dt.timedelta(hours=1),
    )
    assert second is None

    # After the cooldown elapses -> fires again.
    third = await record_alert(
        session,
        heat_spike(event_id=ev.id, current_heat=90.0, prev_heat=50.0),
        now=NOW + dt.timedelta(hours=7),
    )
    assert third is not None

    count = (
        await session.execute(
            select(func.count()).select_from(Alert).where(Alert.event_id == ev.id)
        )
    ).scalar_one()
    assert count == 2
