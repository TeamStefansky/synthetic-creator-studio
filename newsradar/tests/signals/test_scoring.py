"""Heat scoring, cross-platform lift, and tier-1 share."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w
from newsradar.signals.scoring import (
    HeatComponents,
    compute_cross_platform_lift,
    compute_heat,
    compute_tier1_share,
    cross_platform_lift,
    has_tier1_source,
    tier1_share,
)
from tests.signals import _factories as f

T0 = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


def test_heat_spans_full_range_and_thresholds_reachable() -> None:
    cold = compute_heat(
        HeatComponents(
            acceleration=0.0,
            source_diversity=0.0,
            velocity=0.0,
            cross_platform_lift=0.0,
            tier1_share=0.0,
        )
    )
    hot = compute_heat(
        HeatComponents(
            acceleration=12.0,
            source_diversity=1.0,
            velocity=40.0,
            cross_platform_lift=1.0,
            tier1_share=1.0,
        )
    )
    assert cold < 10.0
    assert hot > w.HEAT_CRITICAL  # 85 must be reachable
    assert 0.0 <= cold < hot <= 100.0


def test_heat_monotonic_in_acceleration() -> None:
    def h(accel: float) -> float:
        return compute_heat(
            HeatComponents(
                acceleration=accel,
                source_diversity=0.5,
                velocity=5.0,
                cross_platform_lift=0.5,
                tier1_share=0.5,
            )
        )

    # Strictly increasing up to the normalisation cap, then saturates.
    assert h(0.0) < h(3.0) < h(6.0)
    assert h(6.0) == h(12.0) == pytest.approx(h(w.ACCEL_NORM_DENOM))


def test_none_acceleration_treated_as_zero() -> None:
    base = HeatComponents(
        acceleration=None,
        source_diversity=0.5,
        velocity=5.0,
        cross_platform_lift=0.0,
        tier1_share=0.0,
    )
    zero = HeatComponents(
        acceleration=0.0,
        source_diversity=0.5,
        velocity=5.0,
        cross_platform_lift=0.0,
        tier1_share=0.0,
    )
    assert compute_heat(base) == compute_heat(zero)


def test_cross_platform_lift_pure() -> None:
    # No crossover: single platform.
    assert compute_cross_platform_lift([("news", T0), ("news", T0)]) == 0.0
    # Simultaneous crossover -> 1.0.
    assert compute_cross_platform_lift([("news", T0), ("social", T0)]) == 1.0
    # Crossover at the edge of the window -> ~0.
    edge = compute_cross_platform_lift(
        [("news", T0), ("social", T0 + dt.timedelta(hours=w.CROSS_PLATFORM_WINDOW_HOURS))]
    )
    assert edge == pytest.approx(0.0, abs=1e-9)
    # Half-window crossover -> ~0.5.
    half = compute_cross_platform_lift(
        [("news", T0), ("social", T0 + dt.timedelta(hours=w.CROSS_PLATFORM_WINDOW_HOURS / 2))]
    )
    assert half == pytest.approx(0.5)
    # Crossover beyond the window -> 0.
    beyond = compute_cross_platform_lift(
        [("news", T0), ("social", T0 + dt.timedelta(hours=w.CROSS_PLATFORM_WINDOW_HOURS + 1))]
    )
    assert beyond == 0.0


def test_tier1_share_pure() -> None:
    assert compute_tier1_share([]) == 0.0
    assert compute_tier1_share([(1, 10)]) == 1.0
    assert compute_tier1_share([(4, 10)]) == 0.0
    # tier-1 mass 2.0*5=10 vs tier-2 mass 1.5*5=7.5 -> 10/17.5.
    share = compute_tier1_share([(1, 5), (2, 5)])
    assert share == pytest.approx(10.0 / 17.5)


@pytest.mark.asyncio
async def test_scoring_db_helpers(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)
    news = await f.make_source(session, "news.com", tier=1, source_type="news")
    social = await f.make_source(session, "social.com", tier=3, source_type="social")

    d1 = await f.make_document(session, news, published_at=T0)
    await f.link_doc(session, ev, d1)
    d2 = await f.make_document(session, social, published_at=T0 + dt.timedelta(hours=1))
    await f.link_doc(session, ev, d2)
    await session.commit()

    assert await has_tier1_source(session, ev.id) is True
    assert await tier1_share(session, ev.id) > 0.0
    # news + social within 1h of each other -> strong crossover.
    lift = await cross_platform_lift(session, ev.id)
    assert lift == pytest.approx(1.0 - 1.0 / w.CROSS_PLATFORM_WINDOW_HOURS)
