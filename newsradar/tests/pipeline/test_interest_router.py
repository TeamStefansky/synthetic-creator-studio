"""Interest routing: hybrid keyword+semantic matching + source/subject country filter."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import CountryMatchMode, DocumentEnrichment, Watchlist, WatchlistKind
from newsradar.pipeline.embed import HashingEmbedder, embed_documents
from newsradar.pipeline.interest_router import (
    embed_description,
    evaluate_interest,
    route_interest,
)
from tests.pipeline import _factories as f

_T0 = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)
_RENEWABLE = "The renewable energy transition to solar and wind power with grid storage continues."


async def _set_geo(session: AsyncSession, doc_id: object, country_code: str) -> None:
    await session.execute(
        update(DocumentEnrichment)
        .where(DocumentEnrichment.document_id == doc_id)
        .values(geo={"country_code": country_code})
    )
    await session.commit()


async def _make_interest(
    session: AsyncSession,
    *,
    name: str,
    description: str = "",
    keywords: list[str] | None = None,
    source_countries: list[str] | None = None,
    subject_countries: list[str] | None = None,
    mode: CountryMatchMode = CountryMatchMode.either,
    min_sim: float = 0.78,
) -> Watchlist:
    wl = Watchlist(
        name=name,
        description=description,
        kind=WatchlistKind.interest,
        source_country_filter=source_countries,
        subject_country_filter=subject_countries,
        country_match_mode=mode,
        min_semantic_similarity=min_sim,
        description_embedding=embed_description(HashingEmbedder(), description)
        if description
        else None,
    )
    session.add(wl)
    await session.flush()
    from newsradar.db.models import TermType, WatchlistTerm

    for kw in keywords or []:
        session.add(
            WatchlistTerm(watchlist_id=wl.id, term=kw, term_type=TermType.keyword, weight=1.0)
        )
    await session.commit()
    return wl


@pytest.mark.asyncio
async def test_semantic_only_interest(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "greenwire.com")
    match_doc = await f.make_document(
        session,
        src,
        title="Renewable energy: solar and wind power grid storage transition accelerates",
        body=_RENEWABLE,
        published_at=_T0,
    )
    await f.make_document(
        session,
        src,
        title="Football club signs new striker ahead of the season",
        body="The football club announced a new striker signing today.",
        published_at=_T0 - dt.timedelta(hours=1),
    )
    await session.commit()
    await embed_documents(session, HashingEmbedder())

    interest = await _make_interest(
        session,
        name="clean-energy",
        description="renewable energy solar and wind power grid storage transition",
    )
    hits = await evaluate_interest(session, interest, limit=10)
    assert [h.document.id for h in hits] == [match_doc.id]
    # Semantic path is recorded with the sentinel.
    assert hits[0].result.matched_terms == ["__semantic__"]
    assert hits[0].result.score < 1.0  # semantic-only ranks below keyword hits


@pytest.mark.asyncio
async def test_keyword_interest_outranks_semantic(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "mixed.com")
    kw_doc = await f.make_document(
        session,
        src,
        title="Football transfer window heats up",
        body="A football club completed a marquee signing.",
        published_at=_T0,
    )
    await session.commit()
    await embed_documents(session, HashingEmbedder())

    interest = await _make_interest(session, name="sport", keywords=["football"])
    hits = await evaluate_interest(session, interest, limit=10)
    assert [h.document.id for h in hits] == [kw_doc.id]
    assert "football" in hits[0].result.matched_terms
    assert hits[0].result.score >= 1.0  # keyword hits outrank semantic-only


@pytest.mark.asyncio
async def test_source_vs_subject_country_routing(session: AsyncSession) -> None:
    await f.reset(session)
    # A GB-based outlet publishing a story about Brazil.
    src = await f.make_source(session, "reuters.com")
    await session.execute(update(f.Source).where(f.Source.id == src.id).values(country_code="GB"))
    await session.commit()
    doc = await f.make_document(
        session,
        src,
        title="Brazil economy grows as exports climb",
        body="Brazil reported stronger quarterly growth driven by exports.",
        published_at=_T0,
    )
    await session.commit()
    await embed_documents(session, HashingEmbedder())
    await _set_geo(session, doc.id, "BR")

    # source mode, source_countries=['GB'] -> matches.
    src_interest = await _make_interest(
        session,
        name="gb-source",
        keywords=["Brazil"],
        source_countries=["GB"],
        mode=CountryMatchMode.source,
    )
    assert [h.document.id for h in await evaluate_interest(session, src_interest)] == [doc.id]

    # source mode with the WRONG source country -> no match.
    wrong_src = await _make_interest(
        session,
        name="br-source-wrong",
        keywords=["Brazil"],
        source_countries=["BR"],
        mode=CountryMatchMode.source,
    )
    assert await evaluate_interest(session, wrong_src) == []

    # subject mode, subject_countries=['BR'] -> matches.
    subj_interest = await _make_interest(
        session,
        name="br-subject",
        keywords=["Brazil"],
        subject_countries=["BR"],
        mode=CountryMatchMode.subject,
    )
    assert [h.document.id for h in await evaluate_interest(session, subj_interest)] == [doc.id]

    # subject mode with the WRONG subject country -> no match.
    wrong_subj = await _make_interest(
        session,
        name="gb-subject-wrong",
        keywords=["Brazil"],
        subject_countries=["GB"],
        mode=CountryMatchMode.subject,
    )
    assert await evaluate_interest(session, wrong_subj) == []

    # either mode with both correct filters -> matches.
    either_interest = await _make_interest(
        session,
        name="either",
        keywords=["Brazil"],
        source_countries=["GB"],
        subject_countries=["BR"],
        mode=CountryMatchMode.either,
    )
    assert [h.document.id for h in await evaluate_interest(session, either_interest)] == [doc.id]


@pytest.mark.asyncio
async def test_route_interest_persists_matches(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "greenwire.com")
    await f.make_document(
        session, src, title="Renewable energy transition", body=_RENEWABLE, published_at=_T0
    )
    await session.commit()
    await embed_documents(session, HashingEmbedder())
    interest = await _make_interest(
        session,
        name="clean-energy-2",
        description="renewable energy solar and wind power grid storage transition",
    )
    written = await route_interest(session, interest)
    assert written == 1
    # Idempotent upsert.
    assert await route_interest(session, interest) == 1
