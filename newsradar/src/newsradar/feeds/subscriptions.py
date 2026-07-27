"""Create/reuse :class:`FeedSubscription` rows (and their backing sources).

Creating a subscription creates or reuses a ``sources`` row keyed on the
*registrable* domain (so ``bbc.co.uk`` and ``www.bbc.co.uk`` collapse to one
source). A newly created source is always ``link_only`` — rights are never
inferred from a feed.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import FeedSubscription, Source
from newsradar.feeds.tld import registrable_domain


@dataclass(slots=True)
class SubscriptionResult:
    subscription: FeedSubscription
    created: bool
    duplicate: bool


async def _get_or_create_source(session: AsyncSession, feed_url: str) -> Source:
    domain = registrable_domain(feed_url)
    stmt = (
        pg_insert(Source)
        .values(
            name=domain,
            domain=domain,
            source_type="news",
            tier=4,
            credibility_score=0.5,
            allows_fulltext_storage=False,
            content_rights="link_only",
            active=True,
        )
        .on_conflict_do_nothing(index_elements=["domain"])
    )
    await session.execute(stmt)
    return (await session.execute(select(Source).where(Source.domain == domain))).scalar_one()


async def create_subscription(
    session: AsyncSession,
    feed_url: str,
    *,
    title: str | None = None,
    tags: list[str] | None = None,
    country_code: str | None = None,
    lang: str | None = None,
    poll_interval_seconds: int = 600,
) -> SubscriptionResult:
    """Create a subscription for ``feed_url`` (reusing the source by registrable domain).

    If a subscription for ``feed_url`` already exists it is returned unchanged
    with ``duplicate=True``.
    """

    existing = (
        await session.execute(select(FeedSubscription).where(FeedSubscription.feed_url == feed_url))
    ).scalar_one_or_none()
    if existing is not None:
        return SubscriptionResult(subscription=existing, created=False, duplicate=True)

    source = await _get_or_create_source(session, feed_url)
    sub = FeedSubscription(
        source_id=source.id,
        feed_url=feed_url,
        title=title,
        tags=tags,
        country_code=country_code,
        lang=lang,
        poll_interval_seconds=poll_interval_seconds,
        active=True,
    )
    session.add(sub)
    await session.flush()
    return SubscriptionResult(subscription=sub, created=True, duplicate=False)
