"""Blurb gate: only the top items get a blurb (never the long tail)."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import EditionItem
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import BlurbBatchOut
from newsradar.site.edition import BLURB_TOP_N, build_edition
from tests.site import _edition_factory as ef


class _BlurbResponder:
    def __init__(self) -> None:
        self.blurb_batches = 0
        self.max_items = 0

    def __call__(self, purpose: str, user: str, response_model: type) -> BlurbBatchOut:
        assert purpose == "blurb", f"only blurb should hit the LLM, got {purpose}"
        import json

        payload = json.loads(user)
        self.blurb_batches += 1
        self.max_items = max(self.max_items, len(payload))
        return BlurbBatchOut(
            items=[
                {"item_index": p["item_index"], "blurb": f"Blurb {p['item_index']}."}
                for p in payload
            ]
        )


@pytest.mark.asyncio
async def test_only_top_items_get_blurbs(session: AsyncSession) -> None:
    await ef.reset(session)
    interest = await ef.make_interest(session, "world")
    for sidx in range(20):
        src = await ef.make_source(session, f"s{sidx}.com", tier=2)
        doc = await ef.f.make_document(
            session,
            src,
            title=f"story {sidx}",
            lang="en",
            published_at=ef.NOW - dt.timedelta(minutes=sidx),
        )
        await ef.add_interest_match(session, doc.id, interest, match_score=2.0 - sidx * 0.05)
    await session.commit()

    responder = _BlurbResponder()
    edition = await build_edition(
        session, FakeLLMClient(responder), now=ef.NOW, size=30, generate_blurbs=True
    )

    items = (
        (
            await session.execute(
                select(EditionItem)
                .where(EditionItem.edition_id == edition.id)
                .order_by(EditionItem.position)
            )
        )
        .scalars()
        .all()
    )
    with_blurb = [i for i in items if i.blurb]
    # One batched Haiku call covering at most the top N items.
    assert responder.blurb_batches == 1
    assert responder.max_items <= BLURB_TOP_N
    assert len(with_blurb) == BLURB_TOP_N
    # The long tail (positions >= 15) never gets a blurb.
    assert all(i.blurb is None for i in items[BLURB_TOP_N:])
