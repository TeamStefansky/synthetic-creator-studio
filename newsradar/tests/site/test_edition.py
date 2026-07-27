"""Edition gates: source-share cap, event dedup, per-interest minimum, determinism."""

from __future__ import annotations

import datetime as dt
from collections import Counter

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Document, EditionItem, StoryType
from newsradar.llm.client import FakeLLMClient
from newsradar.site.edition import build_edition, current_edition
from tests.site import _edition_factory as ef


def _no_llm(purpose: str, user: str, response_model: type) -> object:
    raise AssertionError(f"unexpected LLM call for {purpose} (English docs should pass through)")


async def _seed_one_dominant_source(session: AsyncSession) -> None:
    """100 candidates: one source has 40, the rest spread across 20 sources."""

    interest = await ef.make_interest(session, "world")
    big = await ef.make_source(session, "big.com", tier=2)
    for i in range(40):
        doc = await ef.f.make_document(
            session,
            big,
            title=f"big story {i}",
            lang="en",
            published_at=ef.NOW - dt.timedelta(hours=1, minutes=i),
        )
        await ef.add_interest_match(session, doc.id, interest)
    for sidx in range(20):
        src = await ef.make_source(session, f"s{sidx}.com", tier=3)
        for j in range(3):
            doc = await ef.f.make_document(
                session,
                src,
                title=f"s{sidx} story {j}",
                lang="en",
                published_at=ef.NOW - dt.timedelta(hours=2, minutes=sidx * 3 + j),
            )
            await ef.add_interest_match(session, doc.id, interest)
    await session.commit()


@pytest.mark.asyncio
async def test_source_share_cap_and_size(session: AsyncSession) -> None:
    await ef.reset(session)
    await _seed_one_dominant_source(session)

    edition = await build_edition(
        session, FakeLLMClient(_no_llm), now=ef.NOW, size=60, generate_blurbs=False
    )
    assert edition.item_count == 60

    rows = (
        await session.execute(
            select(EditionItem.document_id, Document.source_id)
            .join(Document, Document.id == EditionItem.document_id)
            .where(EditionItem.edition_id == edition.id)
        )
    ).all()
    per_source = Counter(src for _, src in rows)
    cap = int(0.30 * 60)  # 18
    assert max(per_source.values()) <= cap
    # No document appears twice.
    doc_ids = [d for d, _ in rows]
    assert len(doc_ids) == len(set(doc_ids))


@pytest.mark.asyncio
async def test_events_collapse_and_no_duplicate_event(session: AsyncSession) -> None:
    await ef.reset(session)
    from tests.signals import _factories as sf

    interest = await ef.make_interest(session, "energy")
    mon = await ef.f.make_watchlist(session, "mon")
    src_a = await ef.make_source(session, "a.com", tier=1)
    src_b = await ef.make_source(session, "b.com", tier=2)
    d1 = await ef.f.make_document(
        session,
        src_a,
        title="grid attack A",
        lang="en",
        published_at=ef.NOW - dt.timedelta(hours=1),
    )
    d2 = await ef.f.make_document(
        session,
        src_b,
        title="grid attack B",
        lang="en",
        published_at=ef.NOW - dt.timedelta(hours=1),
    )
    # A corroborated event (source_count>=2) contains both candidate docs.
    ev = await sf.make_event(session, mon, title="Grid attack", last_seen_at=ef.NOW)
    ev.source_count = 2
    ev.doc_count = 2
    ev.heat_score = 55.0
    await sf.link_doc(session, ev, d1)
    await sf.link_doc(session, ev, d2)
    await ef.add_interest_match(session, d1.id, interest)
    await ef.add_interest_match(session, d2.id, interest)
    await session.commit()

    edition = await build_edition(
        session, FakeLLMClient(_no_llm), now=ef.NOW, size=60, generate_blurbs=False
    )
    items = (
        (await session.execute(select(EditionItem).where(EditionItem.edition_id == edition.id)))
        .scalars()
        .all()
    )
    # Exactly one story: the event. The two member docs are NOT emitted separately.
    assert len(items) == 1
    assert items[0].story_type == StoryType.event
    assert items[0].event_id == ev.id
    assert items[0].document_id is None


@pytest.mark.asyncio
async def test_each_interest_gets_at_least_two_slots(session: AsyncSession) -> None:
    await ef.reset(session)
    i1 = await ef.make_interest(session, "aaa")
    i2 = await ef.make_interest(session, "zzz")
    # i1 has many candidates; i2 has exactly 2.
    big = await ef.make_source(session, "big.com", tier=2)
    for k in range(30):
        doc = await ef.f.make_document(
            session, big, title=f"a {k}", lang="en", published_at=ef.NOW - dt.timedelta(minutes=k)
        )
        await ef.add_interest_match(session, doc.id, i1, match_score=1.9)
    small = await ef.make_source(session, "small.com", tier=4)
    niche_ids = []
    for k in range(2):
        doc = await ef.f.make_document(
            session,
            small,
            title=f"z {k}",
            lang="en",
            published_at=ef.NOW - dt.timedelta(hours=10, minutes=k),
        )
        await ef.add_interest_match(session, doc.id, i2, match_score=0.8)
        niche_ids.append(doc.id)
    await session.commit()

    # Small edition size to create pressure; the niche interest must still get 2.
    edition = await build_edition(
        session, FakeLLMClient(_no_llm), now=ef.NOW, size=10, generate_blurbs=False
    )
    doc_ids = {
        r[0]
        for r in (
            await session.execute(
                select(EditionItem.document_id).where(EditionItem.edition_id == edition.id)
            )
        ).all()
    }
    assert all(nid in doc_ids for nid in niche_ids)


@pytest.mark.asyncio
async def test_determinism_identical_twice(session: AsyncSession) -> None:
    await ef.reset(session)
    await _seed_one_dominant_source(session)

    e1 = await build_edition(
        session, FakeLLMClient(_no_llm), now=ef.NOW, size=60, generate_blurbs=False
    )
    e2 = await build_edition(
        session, FakeLLMClient(_no_llm), now=ef.NOW, size=60, generate_blurbs=False
    )

    async def _seq(edition_id: object) -> list[tuple]:
        rows = (
            (
                await session.execute(
                    select(EditionItem)
                    .where(EditionItem.edition_id == edition_id)
                    .order_by(EditionItem.position)
                )
            )
            .scalars()
            .all()
        )
        return [
            (
                i.position,
                i.section,
                str(i.story_type),
                str(i.document_id),
                i.personal_score,
                i.reason,
            )
            for i in rows
        ]

    assert await _seq(e1.id) == await _seq(e2.id)
    # A distinct, later build becomes `current`.
    e3 = await build_edition(
        session,
        FakeLLMClient(_no_llm),
        now=ef.NOW + dt.timedelta(minutes=30),
        size=60,
        generate_blurbs=False,
    )
    assert (await current_edition(session)).id == e3.id  # type: ignore[union-attr]
