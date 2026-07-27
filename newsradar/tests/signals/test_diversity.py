"""Source diversity — tier-weighted normalised entropy; volume alone is not enough."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals.diversity import diversity_from_counts, source_diversity
from tests.signals import _factories as f


def test_single_source_is_zero() -> None:
    assert diversity_from_counts([(1, 50)]) == 0.0


def test_many_even_sources_beats_one_dominant() -> None:
    # 50 docs from one source vs an even spread across 5 sources.
    one_dominant = diversity_from_counts([(2, 50)])
    even_spread = diversity_from_counts([(2, 10)] * 5)
    assert one_dominant == 0.0
    assert even_spread > 0.9


def test_tier_weighting_shapes_distribution() -> None:
    # Two sources with equal doc counts but different tiers are *not* an even split
    # once tier-weighted, so entropy is below 1.0.
    weighted = diversity_from_counts([(1, 10), (4, 10)])  # 2.0 vs 0.5 mass
    assert 0.0 < weighted < 1.0


@pytest.mark.asyncio
async def test_source_diversity_db(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)

    # 40 docs from one outlet == noise (low diversity).
    noisy_src = await f.make_source(session, "farm.com", tier=4)
    for _ in range(40):
        d = await f.make_document(session, noisy_src)
        await f.link_doc(session, ev, d)
    await session.commit()
    noisy = await source_diversity(session, ev.id)
    assert noisy == 0.0

    await f.reset(session)
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)
    # 40 docs from 20 outlets == a real event (high diversity).
    for i in range(20):
        s = await f.make_source(session, f"outlet{i}.com", tier=2)
        for _ in range(2):
            d = await f.make_document(session, s)
            await f.link_doc(session, ev, d)
    await session.commit()
    real = await source_diversity(session, ev.id)
    assert real > 0.9
