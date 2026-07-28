"""Private reader site API (P6): editions, stories, refresh, feeds, share links.

Every story payload is built by ``site.serializers.to_story_out`` (the rights +
attribution chokepoint); the feed endpoints reuse the same builder so their links
point to the original external article.
"""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import Pagination, get_report_llm, get_session, pagination
from newsradar.api.schemas import (
    EditionOut,
    EditionSummaryOut,
    FullCoverageOut,
    Page,
    ShareLinkCreateIn,
    ShareLinkOut,
    StoryOut,
)
from newsradar.config import get_settings
from newsradar.db.models import Edition, ShareLink, ShareScope
from newsradar.llm.client import LLMClient
from newsradar.site.coverage import build_full_coverage
from newsradar.site.edition import build_edition, current_edition
from newsradar.site.feeds import render_atom, render_json_feed, render_rss
from newsradar.site.serializers import edition_stories, serialize_edition, to_story_out
from newsradar.site.sharelinks import create_share_link, revoke_share_link

router = APIRouter(tags=["site"])


def _lang() -> str:
    return get_settings().reader_target_lang


def _share_out(link: ShareLink) -> ShareLinkOut:
    out = ShareLinkOut.model_validate(link)
    out.url = f"/p/{link.token}"
    return out


# ------------------------------------------------------------------ editions


@router.get("/site/edition/current", response_model=EditionOut)
async def get_current_edition(session: AsyncSession = Depends(get_session)) -> EditionOut:
    edition = await current_edition(session)
    if edition is None:
        raise HTTPException(status_code=404, detail="no edition yet — POST /site/refresh")
    return await serialize_edition(session, edition, target_lang=_lang())


@router.get("/site/editions", response_model=Page[EditionSummaryOut])
async def list_editions(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[EditionSummaryOut]:
    total = (await session.execute(select(func.count()).select_from(Edition))).scalar_one()
    rows = (
        (
            await session.execute(
                select(Edition)
                .order_by(Edition.generated_at.desc())
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[EditionSummaryOut.model_validate(e) for e in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/site/editions/{edition_id}", response_model=EditionOut)
async def get_edition(
    edition_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> EditionOut:
    edition = await session.get(Edition, edition_id)
    if edition is None:
        raise HTTPException(status_code=404, detail="edition not found")
    return await serialize_edition(session, edition, target_lang=_lang())


@router.get("/site/story/{story_type}/{story_id}", response_model=StoryOut)
async def get_story(
    story_type: str,
    story_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> StoryOut:
    if story_type not in ("event", "document"):
        raise HTTPException(status_code=404, detail="unknown story type")
    story = await to_story_out(
        session,
        story_type=story_type,
        event_id=story_id if story_type == "event" else None,
        document_id=story_id if story_type == "document" else None,
        target_lang=_lang(),
    )
    if story is None:
        raise HTTPException(status_code=404, detail="story not found")
    return story


@router.get("/site/story/event/{event_id}/full-coverage", response_model=FullCoverageOut)
async def get_full_coverage(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> FullCoverageOut:
    """Google-News "Full Coverage" for an event: coverage grouped into angles
    (embedding sub-clusters) plus by-country and entity-targeted stance facets.
    404 when the event is missing or has fewer than two distinct outlets."""

    coverage = await build_full_coverage(session, event_id, target_lang=_lang())
    if coverage is None:
        raise HTTPException(
            status_code=404, detail="no full coverage — event missing or single-source"
        )
    return coverage


@router.post("/site/refresh", response_model=EditionSummaryOut, status_code=201)
async def refresh_edition(
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_report_llm),
) -> EditionSummaryOut:
    """Build a fresh immutable edition now and return its summary."""

    edition = await build_edition(session, llm)
    return EditionSummaryOut.model_validate(edition)


# ------------------------------------------------------------------ feeds


async def _current_stories(session: AsyncSession) -> tuple[Edition | None, list[StoryOut]]:
    edition = await current_edition(session)
    if edition is None:
        return None, []
    return edition, await edition_stories(session, edition, target_lang=_lang())


@router.get("/site/feed.rss")
async def site_feed_rss(session: AsyncSession = Depends(get_session)) -> Response:
    _, stories = await _current_stories(session)
    xml = render_rss(
        stories,
        title="NewsRadar",
        description="Your NewsRadar front page",
        now=dt.datetime.now(dt.UTC),
    )
    return Response(content=xml, media_type="application/rss+xml")


@router.get("/site/feed.atom")
async def site_feed_atom(session: AsyncSession = Depends(get_session)) -> Response:
    _, stories = await _current_stories(session)
    xml = render_atom(
        stories, title="NewsRadar", feed_id="urn:newsradar:site", now=dt.datetime.now(dt.UTC)
    )
    return Response(content=xml, media_type="application/atom+xml")


@router.get("/site/feed.json")
async def site_feed_json(session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    _, stories = await _current_stories(session)
    return render_json_feed(stories, title="NewsRadar", feed_url="/site/feed.json")


# ------------------------------------------------------------------ share links


@router.get("/share-links", response_model=list[ShareLinkOut])
async def list_share_links(session: AsyncSession = Depends(get_session)) -> list[ShareLinkOut]:
    rows = (
        (await session.execute(select(ShareLink).order_by(ShareLink.created_at.desc())))
        .scalars()
        .all()
    )
    return [_share_out(link) for link in rows]


@router.post("/share-links", response_model=ShareLinkOut, status_code=201)
async def create_share(
    body: ShareLinkCreateIn, session: AsyncSession = Depends(get_session)
) -> ShareLinkOut:
    link = await create_share_link(
        session,
        scope=ShareScope(body.scope),
        target_id=body.target_id,
        label=body.label,
        expires_at=body.expires_at,
    )
    return _share_out(link)


@router.post("/share-links/{link_id}/revoke", response_model=ShareLinkOut)
async def revoke_share(
    link_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> ShareLinkOut:
    link = await revoke_share_link(session, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="share link not found")
    return _share_out(link)


@router.delete("/share-links/{link_id}", status_code=204)
async def delete_share(link_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    link = await session.get(ShareLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="share link not found")
    await session.delete(link)
    await session.commit()
