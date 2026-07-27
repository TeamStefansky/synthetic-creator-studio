"""Conditional polling of :class:`FeedSubscription` rows.

Each active subscription is fetched with its stored ``ETag`` / ``Last-Modified``
(conditional GET); a ``304 Not Modified`` yields no documents and costs nothing.
On success the validators are persisted and the failure counter reset. After
:data:`MAX_CONSECUTIVE_FAILURES` consecutive failures a subscription is
auto-deactivated with a recorded reason.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.base import RawDocument
from newsradar.connectors.rss import parse_feed
from newsradar.db.models import FeedSubscription, Source
from newsradar.feeds.http import Fetcher
from newsradar.logging import get_logger

log = get_logger(__name__)

MAX_CONSECUTIVE_FAILURES = 10


def _record_failure(sub: FeedSubscription, reason: str) -> None:
    sub.consecutive_failures += 1
    if sub.consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
        sub.active = False
        sub.deactivated_reason = (
            f"auto-deactivated after {sub.consecutive_failures} consecutive failures: {reason}"
        )
        log.warning(
            "feeds.subscription.deactivated",
            feed_url=sub.feed_url,
            failures=sub.consecutive_failures,
            reason=reason,
        )


async def _active_subscriptions(
    session: AsyncSession,
    lang_filter: list[str] | None,
    country_filter: list[str] | None,
) -> list[tuple[FeedSubscription, str]]:
    stmt = (
        select(FeedSubscription, Source.domain)
        .join(Source, Source.id == FeedSubscription.source_id)
        .where(FeedSubscription.active.is_(True))
    )
    if lang_filter:
        stmt = stmt.where(FeedSubscription.lang.in_(lang_filter))
    if country_filter:
        stmt = stmt.where(FeedSubscription.country_code.in_(country_filter))
    return [(sub, domain) for sub, domain in (await session.execute(stmt)).all()]


async def poll_subscriptions(
    session: AsyncSession,
    fetcher: Fetcher,
    since: dt.datetime,
    *,
    lang_filter: list[str] | None = None,
    country_filter: list[str] | None = None,
) -> list[RawDocument]:
    """Poll every active subscription once and return the fresh documents.

    Persists ``ETag`` / ``Last-Modified`` / poll timestamps / failure counters and
    commits before returning.
    """

    if since.tzinfo is None:
        since = since.replace(tzinfo=dt.UTC)
    now = dt.datetime.now(dt.UTC)
    docs: list[RawDocument] = []

    for sub, domain in await _active_subscriptions(session, lang_filter, country_filter):
        headers: dict[str, str] = {}
        if sub.etag:
            headers["If-None-Match"] = sub.etag
        if sub.last_modified:
            headers["If-Modified-Since"] = sub.last_modified

        sub.last_polled_at = now
        try:
            res = await fetcher.get(sub.feed_url, headers=headers)
        except Exception as exc:  # noqa: BLE001 - one bad feed must not abort the poll
            _record_failure(sub, str(exc))
            continue

        if res.status_code == 304:
            sub.consecutive_failures = 0
            sub.last_ok_at = now
            continue
        if not res.ok or not res.text.strip():
            _record_failure(sub, f"HTTP {res.status_code}")
            continue

        etag = res.headers.get("etag")
        last_modified = res.headers.get("last-modified")
        if etag:
            sub.etag = etag
        if last_modified:
            sub.last_modified = last_modified
        sub.consecutive_failures = 0
        sub.last_ok_at = now

        meta = {
            "source_domain": domain,
            "country": sub.country_code,
            "lang": sub.lang,
            "tier": 4,
        }
        for doc in parse_feed(res.text, meta):
            if doc.published_at is not None and doc.published_at < since:
                continue
            docs.append(doc)

    await session.commit()
    return docs
