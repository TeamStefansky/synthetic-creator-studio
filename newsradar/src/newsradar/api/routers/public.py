"""Public, unauthenticated share router mounted at ``/p`` (P6).

Every route is rate-limited (60 req/min/IP by default; the 61st returns 429) and
serves stories through the same ``to_story_out`` chokepoint as the private site, so
the rights and attribution gates hold here too. A revoked or expired token returns
410; view accounting is incremented in a background task so it never blocks.
"""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_session
from newsradar.api.schemas import EditionOut, StoryOut
from newsradar.config import get_settings
from newsradar.db.models import (
    Edition,
    Report,
    ReportType,
    ShareLink,
    ShareScope,
    Watchlist,
)
from newsradar.site.edition import current_edition
from newsradar.site.feeds import render_atom, render_json_feed, render_rss
from newsradar.site.ratelimit import RateLimiter, get_rate_limiter
from newsradar.site.serializers import (
    edition_stories,
    serialize_edition,
    to_story_out,
)
from newsradar.site.sharelinks import ShareState, evaluate, get_by_token, record_view


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def rate_limit(request: Request, limiter: RateLimiter = Depends(get_rate_limiter)) -> None:
    """Router-level dependency enforcing the per-IP public rate limit."""

    if not await limiter.allow(_client_ip(request)):
        raise HTTPException(status_code=429, detail="rate limit exceeded")


router = APIRouter(prefix="/p", tags=["public"], dependencies=[Depends(rate_limit)])


async def _resolve_link(session: AsyncSession, token: str) -> ShareLink:
    link = await get_by_token(session, token)
    state = evaluate(link, now=dt.datetime.now(dt.UTC))
    if state is ShareState.not_found:
        raise HTTPException(status_code=404, detail="share link not found")
    if state in (ShareState.revoked, ShareState.expired):
        raise HTTPException(status_code=410, detail=f"share link {state.value}")
    assert link is not None
    return link


async def _edition_for(session: AsyncSession, link: ShareLink) -> Edition | None:
    if link.scope == ShareScope.edition and link.target_id is not None:
        return await session.get(Edition, link.target_id)
    return await current_edition(session)


async def _scope_stories(session: AsyncSession, link: ShareLink) -> tuple[str, list[StoryOut]]:
    lang = get_settings().reader_target_lang
    edition = await _edition_for(session, link)
    if edition is None:
        return ("NewsRadar", [])
    if link.scope == ShareScope.interest and link.target_id is not None:
        interest = await session.get(Watchlist, link.target_id)
        section = interest.name if interest is not None else None
        stories = await edition_stories(session, edition, section=section, target_lang=lang)
        return (interest.name if interest else "NewsRadar", stories)
    stories = await edition_stories(session, edition, target_lang=lang)
    return (link.label or "NewsRadar", stories)


@router.get("/{token}")
async def public_view(
    token: str,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> EditionOut | dict[str, object]:
    """Serve the shared edition/interest feed (or the latest digest for a digest link)."""

    link = await _resolve_link(session, token)
    background.add_task(record_view, link.id)
    lang = get_settings().reader_target_lang

    if link.scope == ShareScope.digest:
        report = (
            await session.execute(
                select(Report)
                .where(Report.report_type == ReportType.headline_digest)
                .order_by(Report.generated_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if report is None:
            raise HTTPException(status_code=404, detail="no digest available")
        return {
            "scope": "digest",
            "generated_at": report.generated_at.isoformat(),
            "markdown": report.markdown,
            "html": report.html,
        }

    if link.scope == ShareScope.interest and link.target_id is not None:
        title, stories = await _scope_stories(session, link)
        return {"scope": "interest", "title": title, "stories": stories}

    edition = await _edition_for(session, link)
    if edition is None:
        raise HTTPException(status_code=404, detail="no edition available")
    return await serialize_edition(session, edition, target_lang=lang)


@router.get("/{token}/story/{story_type}/{story_id}", response_model=StoryOut)
async def public_story(
    token: str,
    story_type: str,
    story_id: uuid.UUID,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> StoryOut:
    """Serve a single shared story through the serializer chokepoint."""

    link = await _resolve_link(session, token)
    background.add_task(record_view, link.id)
    if story_type not in ("event", "document"):
        raise HTTPException(status_code=404, detail="unknown story type")
    story = await to_story_out(
        session,
        story_type=story_type,
        event_id=story_id if story_type == "event" else None,
        document_id=story_id if story_type == "document" else None,
        target_lang=get_settings().reader_target_lang,
    )
    if story is None:
        raise HTTPException(status_code=404, detail="story not found")
    return story


@router.get("/{token}/feed.rss")
async def public_feed_rss(token: str, session: AsyncSession = Depends(get_session)) -> Response:
    link = await _resolve_link(session, token)
    title, stories = await _scope_stories(session, link)
    xml = render_rss(
        stories, title=title, description="Shared NewsRadar feed", now=dt.datetime.now(dt.UTC)
    )
    return Response(content=xml, media_type="application/rss+xml")


@router.get("/{token}/feed.atom")
async def public_feed_atom(token: str, session: AsyncSession = Depends(get_session)) -> Response:
    link = await _resolve_link(session, token)
    title, stories = await _scope_stories(session, link)
    xml = render_atom(
        stories, title=title, feed_id=f"urn:newsradar:share:{token}", now=dt.datetime.now(dt.UTC)
    )
    return Response(content=xml, media_type="application/atom+xml")


@router.get("/{token}/feed.json")
async def public_feed_json(
    token: str, session: AsyncSession = Depends(get_session)
) -> dict[str, object]:
    link = await _resolve_link(session, token)
    title, stories = await _scope_stories(session, link)
    return render_json_feed(stories, title=title, feed_url=f"/p/{token}/feed.json")
