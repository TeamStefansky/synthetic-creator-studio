"""The negativity gate: entity-targeted stance, NOT document sentiment.

A disaster story is negative overall but favorable to the monitored entity; its
``negativity_index`` for that entity must stay below 0.2 (spec DoD).
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals.negativity import (
    NegRow,
    compute_negativity,
    event_negativity,
)
from tests.signals import _factories as f


def _row(stance: int, *, is_opinion: bool = False, tier: int = 2, primary: bool = True) -> NegRow:
    import uuid

    return NegRow(
        entity_id=uuid.UUID(int=1),
        entity_name="City Hall",
        is_primary=primary,
        stance=stance,
        confidence=0.9,
        prominence=0.9,
        is_opinion=is_opinion,
        tier=tier,
    )


def test_favorable_stance_yields_zero_negativity() -> None:
    # Disaster coverage, but stance toward the entity is positive -> no negativity.
    neg = compute_negativity([_row(1), _row(2), _row(1)])
    assert neg.aggregate.negativity_index == 0.0
    assert neg.aggregate.negative_doc_count == 0
    assert neg.aggregate.negative_reach_share == 0.0


def test_negative_intensity_and_reach() -> None:
    # Two hostile (-2 -> intensity 1.0), one favorable, one neutral.
    neg = compute_negativity([_row(-2), _row(-2), _row(1), _row(0)])
    assert neg.aggregate.negativity_index == 1.0  # mean intensity of the negatives
    assert neg.aggregate.negative_doc_count == 2
    # 2 of 4 equally-weighted docs are negative -> reach 0.5.
    assert neg.aggregate.negative_reach_share == pytest.approx(0.5)


def test_opinion_kept_in_its_own_bucket() -> None:
    neg = compute_negativity([_row(-2), _row(-2, is_opinion=True)])
    # Main bucket sees only the non-opinion negative doc.
    assert neg.aggregate.negative_doc_count == 1
    assert neg.aggregate_opinion.negative_doc_count == 1
    # The opinion piece never inflates the main index/reach.
    assert neg.aggregate.total_doc_count == 1
    assert neg.aggregate_opinion.total_doc_count == 1


@pytest.mark.asyncio
async def test_disaster_favorable_entity_db_gate(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "citynews.com", tier=1)
    wl = await f.make_watchlist(session)
    entity = await f.add_entity(session, wl, "City Hall", entity_type="org", is_primary=True)
    ev = await f.make_event(session, wl)

    # A catastrophic wildfire story: overall sentiment strongly negative, but the
    # stance toward City Hall (praised for its response) is favorable (+1).
    doc = await f.make_document(session, src, title="Wildfire hits the hills")
    await f.link_doc(session, ev, doc)
    await f.add_enrichment(session, doc, sentiment_overall=-0.8, prominence=0.9, is_opinion=False)
    await f.add_stance(session, doc, entity, stance=1, confidence=0.95, evidence_span="praised")
    await session.commit()

    neg = await event_negativity(session, ev.id)
    entity_neg = neg.for_entity(entity.id)
    assert entity_neg is not None
    assert entity_neg.main.negativity_index < 0.2  # THE GATE
    assert entity_neg.main.negativity_index == 0.0
    assert neg.aggregate.negativity_index < 0.2


@pytest.mark.asyncio
async def test_genuinely_negative_entity_db(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "citynews.com", tier=1)
    wl = await f.make_watchlist(session)
    entity = await f.add_entity(session, wl, "Mayor", entity_type="person", is_primary=True)
    ev = await f.make_event(session, wl)

    for _ in range(3):
        doc = await f.make_document(session, src, title="Mayor under fire")
        await f.link_doc(session, ev, doc)
        await f.add_enrichment(session, doc, sentiment_overall=-0.3, prominence=1.0)
        await f.add_stance(session, doc, entity, stance=-2, confidence=0.9)
    await session.commit()

    neg = await event_negativity(session, ev.id)
    entity_neg = neg.for_entity(entity.id)
    assert entity_neg is not None
    assert entity_neg.main.negativity_index >= 0.6
    assert entity_neg.main.negative_doc_count == 3
    assert entity_neg.main.negative_reach_share == pytest.approx(1.0)
