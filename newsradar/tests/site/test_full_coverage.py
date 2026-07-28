"""Full Coverage (P8): angle sub-clustering + by-country + stance facets.

Covers the deterministic angle grouping, the multi-source gate, the honest
stance summary (unassessed vs assessed), and the pure connected-components helper.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import (
    DocumentEnrichment,
    EntityType,
    Event,
    EventDocument,
    EventStatus,
    StanceAssessment,
    Translation,
    TranslationField,
    Watchlist,
    WatchlistEntity,
    WatchlistKind,
)
from newsradar.site.coverage import _connected_components, build_full_coverage
from tests.site import _edition_factory as ef


def _vec(seed: float) -> list[float]:
    """A 1024-dim unit-ish vector pointing mostly along one axis, so vectors with
    the same seed are ~identical (cosine≈1) and different seeds are far apart."""

    v = [0.0] * 1024
    idx = int(seed) % 1024
    v[idx] = 1.0
    return v


async def _event_with_docs(session: AsyncSession) -> tuple[Event, Watchlist]:
    await ef.reset(session)
    wl = Watchlist(name="wl", kind=WatchlistKind.monitoring, active=True)
    session.add(wl)
    await session.flush()
    ent = WatchlistEntity(watchlist_id=wl.id, name="Target", entity_type=EntityType.org)
    session.add(ent)
    await session.flush()

    event = Event(watchlist_id=wl.id, title="Event", status=EventStatus.active)
    session.add(event)
    await session.flush()

    # Angle A: two outlets, near-identical embeddings (axis 1). Angle B: two
    # outlets, a different embedding (axis 500).
    plan = [
        ("a1.com", "US", 1, "Angle A headline", 2),  # supportive stance +2
        ("a2.com", "GB", 1, "Angle A other", -1),  # critical stance -1
        ("b1.com", "US", 500, "Angle B headline", 0),  # neutral stance 0
        ("b2.com", "FR", 500, "Angle B other", None),  # no stance row -> unassessed
    ]
    docs = []
    for domain, country, axis, title, stance in plan:
        src = await ef.make_source(session, domain, country_code=country, lang="en")
        doc = await ef.f.make_document(session, src, title=title, lang="en")
        session.add(
            DocumentEnrichment(document_id=doc.id, embedding=_vec(axis), enriched_at=ef.NOW)
        )
        session.add(EventDocument(event_id=event.id, document_id=doc.id, added_at=ef.NOW))
        if stance is not None:
            session.add(
                StanceAssessment(document_id=doc.id, entity_id=ent.id, stance=stance)
            )
        docs.append(doc)
    await session.commit()
    return event, wl


@pytest.mark.asyncio
async def test_full_coverage_groups_two_angles(session: AsyncSession) -> None:
    event, _ = await _event_with_docs(session)
    fc = await build_full_coverage(session, event.id, target_lang="en")
    assert fc is not None
    assert fc.total_outlets == 4
    # Two angles, each with two outlets.
    assert len(fc.angles) == 2
    assert sorted(a.size for a in fc.angles) == [2, 2]
    # By-country facet counts every outlet.
    assert sum(c.count for c in fc.by_country) == 4
    countries = {c.country for c in fc.by_country}
    assert {"US", "GB", "FR"} <= countries
    # Stance: +2 supportive, -1 critical, 0 neutral, one unassessed.
    assert fc.stance.assessed is True
    assert fc.stance.supportive == 1
    assert fc.stance.critical == 1
    assert fc.stance.neutral == 1
    assert fc.stance.unassessed == 1


@pytest.mark.asyncio
async def test_angle_label_prefers_translated_headline(session: AsyncSession) -> None:
    event, _ = await _event_with_docs(session)
    # Translate every member's headline; whichever docs are the angle
    # representatives, the labels must come from the translations, not the titles.
    rows = (
        await session.execute(
            EventDocument.__table__.select().where(EventDocument.event_id == event.id)
        )
    ).all()
    for r in rows:
        session.add(
            Translation(
                document_id=r.document_id,
                target_lang="en",
                field=TranslationField.title,
                source_lang="he",
                text="TRANSLATED LABEL",
                model="claude-haiku-4-5-20251001",
                content_hash="h" * 16,
            )
        )
    await session.commit()
    fc = await build_full_coverage(session, event.id, target_lang="en")
    assert fc is not None
    assert all(a.label == "TRANSLATED LABEL" for a in fc.angles)


@pytest.mark.asyncio
async def test_single_source_has_no_full_coverage(session: AsyncSession) -> None:
    await ef.reset(session)
    wl = Watchlist(name="wl", kind=WatchlistKind.monitoring, active=True)
    session.add(wl)
    await session.flush()
    event = Event(watchlist_id=wl.id, title="solo", status=EventStatus.emerging)
    session.add(event)
    await session.flush()
    src = await ef.make_source(session, "only.com", country_code="US")
    doc = await ef.f.make_document(session, src, title="solo story")
    session.add(EventDocument(event_id=event.id, document_id=doc.id, added_at=ef.NOW))
    await session.commit()
    assert await build_full_coverage(session, event.id) is None


@pytest.mark.asyncio
async def test_missing_event_returns_none(session: AsyncSession) -> None:
    await ef.reset(session)
    assert await build_full_coverage(session, uuid.uuid4()) is None


def test_connected_components_is_deterministic_and_order_independent() -> None:
    # 4 nodes: {0,1} linked, {2,3} linked, no cross links.
    sims = [
        [1.0, 0.95, 0.1, 0.1],
        [0.95, 1.0, 0.1, 0.1],
        [0.1, 0.1, 1.0, 0.93],
        [0.1, 0.1, 0.93, 1.0],
    ]
    groups = _connected_components(4, sims, 0.9)
    assert sorted(sorted(g) for g in groups) == [[0, 1], [2, 3]]


def test_connected_components_singletons_when_below_threshold() -> None:
    sims = [[1.0, 0.5], [0.5, 1.0]]
    groups = _connected_components(2, sims, 0.9)
    assert sorted(sorted(g) for g in groups) == [[0], [1]]
