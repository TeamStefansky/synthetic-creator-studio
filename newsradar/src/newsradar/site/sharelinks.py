"""Share links — unguessable, revocable public access tokens (P6).

Tokens are 256-bit (``secrets.token_urlsafe(32)`` → 43 url-safe chars). A link is
served only while it is neither revoked nor expired; otherwise the public router
returns 410. View accounting is incremented out of band so it never blocks a
response.
"""

from __future__ import annotations

import datetime as dt
import secrets
import uuid
from enum import Enum

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import ShareLink, ShareScope
from newsradar.db.session import get_sessionmaker
from newsradar.logging import get_logger

log = get_logger(__name__)

TOKEN_BYTES = 32  # secrets.token_urlsafe(32) -> 43 chars, 256 bits of entropy


class ShareState(Enum):
    ok = "ok"
    not_found = "not_found"
    revoked = "revoked"
    expired = "expired"


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


async def create_share_link(
    session: AsyncSession,
    *,
    scope: ShareScope,
    target_id: uuid.UUID | None = None,
    label: str | None = None,
    expires_at: dt.datetime | None = None,
) -> ShareLink:
    link = ShareLink(
        token=new_token(),
        scope=scope,
        target_id=target_id,
        label=label,
        expires_at=expires_at,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def revoke_share_link(
    session: AsyncSession, link_id: uuid.UUID, *, now: dt.datetime | None = None
) -> ShareLink | None:
    link = await session.get(ShareLink, link_id)
    if link is None:
        return None
    if link.revoked_at is None:
        link.revoked_at = now or dt.datetime.now(dt.UTC)
        await session.commit()
    return link


def evaluate(link: ShareLink | None, *, now: dt.datetime) -> ShareState:
    """Classify a share link for the public router (drives 404 vs 410 vs serve)."""

    if link is None:
        return ShareState.not_found
    if link.revoked_at is not None:
        return ShareState.revoked
    if link.expires_at is not None and link.expires_at <= now:
        return ShareState.expired
    return ShareState.ok


async def get_by_token(session: AsyncSession, token: str) -> ShareLink | None:
    from sqlalchemy import select

    return (
        await session.execute(select(ShareLink).where(ShareLink.token == token))
    ).scalar_one_or_none()


async def record_view(link_id: uuid.UUID, *, now: dt.datetime | None = None) -> None:
    """Increment view accounting in its own session — never blocks the response."""

    now = now or dt.datetime.now(dt.UTC)
    factory = get_sessionmaker()
    try:
        async with factory() as session:
            await session.execute(
                update(ShareLink)
                .where(ShareLink.id == link_id)
                .values(view_count=ShareLink.view_count + 1, last_viewed_at=now)
            )
            await session.commit()
    except Exception as exc:  # noqa: BLE001 - view accounting must never surface an error
        log.warning("sharelink.view_failed", link_id=str(link_id), error=str(exc))
