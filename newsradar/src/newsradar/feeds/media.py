"""Presentation-metadata extraction into ``document_media`` (P5).

For each document we capture an image URL, OG tags, a byline and a favicon so P7
can render article-grade cards. RSS media (captured at parse time into
``documents.raw['media']``) is preferred; only when it is absent do we fetch the
article ``<head>`` (HEAD then a ranged GET, capped at 64KB) for OG tags. We also
probe whether the page may be iframed and cache that per domain.

**Images are never downloaded, cached, resized or re-hosted — only the URL is
stored.** Hotlinking with attribution is the legally safe posture.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

from selectolax.parser import HTMLParser
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Document, DocumentMedia, DomainFrameability
from newsradar.feeds.http import MAX_HEAD_BYTES, Fetcher
from newsradar.logging import get_logger

log = get_logger(__name__)

FRAMEABILITY_TTL = dt.timedelta(days=30)


@dataclass(slots=True)
class OgMetadata:
    image_url: str | None = None
    image_alt: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_site_name: str | None = None
    favicon_url: str | None = None
    byline: str | None = None


def _meta(tree: HTMLParser, *, prop: str | None = None, name: str | None = None) -> str | None:
    selector = f'meta[property="{prop}"]' if prop else f'meta[name="{name}"]'
    node = tree.css_first(selector)
    if node is None:
        return None
    content = node.attributes.get("content")
    return content.strip() if content else None


def parse_og(html: str, base_url: str) -> OgMetadata:
    """Parse Open Graph / standard ``<head>`` metadata from ``html``."""

    tree = HTMLParser(html)
    image = _meta(tree, prop="og:image") or _meta(tree, name="twitter:image")
    favicon: str | None = None
    for link in tree.css("link"):
        rel = (link.attributes.get("rel") or "").lower()
        if "icon" in rel and link.attributes.get("href"):
            favicon = urljoin(base_url, link.attributes["href"])
            break
    return OgMetadata(
        image_url=urljoin(base_url, image) if image else None,
        image_alt=_meta(tree, prop="og:image:alt"),
        og_title=_meta(tree, prop="og:title"),
        og_description=_meta(tree, prop="og:description") or _meta(tree, name="description"),
        og_site_name=_meta(tree, prop="og:site_name"),
        favicon_url=favicon,
        byline=_meta(tree, prop="article:author") or _meta(tree, name="author"),
    )


def frameability_from_headers(headers: dict[str, str]) -> bool | None:
    """Decide iframe-ability from response headers.

    ``False`` when ``X-Frame-Options`` is set or a CSP ``frame-ancestors``
    directive would exclude us; ``True`` when neither restricts framing; ``None``
    when it cannot be determined.
    """

    if headers.get("x-frame-options"):
        return False
    csp = headers.get("content-security-policy")
    if csp:
        for directive in csp.split(";"):
            parts = directive.split()
            if parts and parts[0].lower() == "frame-ancestors":
                allow = [p.lower() for p in parts[1:]]
                if not allow or allow == ["'none'"]:
                    return False
                # '*' or a broad https: scheme allows us; a specific allowlist excludes us.
                return "*" in allow or "https:" in allow
    return True


async def _domain_frameable(
    session: AsyncSession, domain: str, headers: dict[str, str], now: dt.datetime
) -> bool | None:
    cached = await session.get(DomainFrameability, domain)
    if (
        cached is not None
        and cached.checked_at is not None
        and now - cached.checked_at < FRAMEABILITY_TTL
    ):
        return cached.frameable
    frameable = frameability_from_headers(headers)
    stmt = pg_insert(DomainFrameability).values(domain=domain, frameable=frameable, checked_at=now)
    stmt = stmt.on_conflict_do_update(
        index_elements=["domain"],
        set_={"frameable": stmt.excluded.frameable, "checked_at": stmt.excluded.checked_at},
    )
    await session.execute(stmt)
    return frameable


async def _fetch_head(fetcher: Fetcher, url: str) -> tuple[str, dict[str, str]] | None:
    """HEAD (for frameability headers) then a ranged GET of the ``<head>``."""

    headers: dict[str, str] = {}
    try:
        head = await fetcher.head(url)
        headers = head.headers
    except Exception:  # noqa: BLE001 - HEAD is best-effort
        headers = {}
    try:
        res = await fetcher.get_ranged(url, MAX_HEAD_BYTES)
    except Exception as exc:  # noqa: BLE001 - one bad article must not abort the batch
        log.debug("feeds.media.fetch_failed", url=url, error=str(exc))
        return None
    if not res.ok:
        return None
    # Prefer the GET's response headers when present (some servers omit them on HEAD).
    merged = {**headers, **res.headers}
    return res.text, merged


async def backfill_media(
    session: AsyncSession,
    fetcher: Fetcher,
    *,
    limit: int = 200,
    respect_robots: bool = True,
) -> int:
    """Populate ``document_media`` for documents that lack it. Returns rows written.

    RSS media in ``documents.raw['media']`` is used without any network call; only
    documents with no RSS image trigger an OG ``<head>`` fetch.
    """

    stmt = (
        select(Document)
        .outerjoin(DocumentMedia, DocumentMedia.document_id == Document.id)
        .where(DocumentMedia.document_id.is_(None))
        .order_by(Document.published_at.desc().nulls_last())
        .limit(limit)
    )
    docs = list((await session.execute(stmt)).scalars().all())
    if not docs:
        return 0

    now = dt.datetime.now(dt.UTC)
    written = 0
    for doc in docs:
        row: dict[str, object] = {"document_id": doc.id, "fetched_at": now, "byline": doc.author}
        rss_media = (doc.raw or {}).get("media") if isinstance(doc.raw, dict) else None

        if isinstance(rss_media, dict) and rss_media.get("image_url"):
            row.update(
                image_url=rss_media.get("image_url"),
                image_width=rss_media.get("image_width"),
                image_height=rss_media.get("image_height"),
                image_alt=rss_media.get("image_alt"),
            )
        else:
            fetched = None
            if not respect_robots or await fetcher.robots_allowed(doc.url):
                fetched = await _fetch_head(fetcher, doc.url)
            if fetched is not None:
                html, headers = fetched
                og = parse_og(html, doc.url)
                domain = urlsplit(doc.url).hostname or ""
                frameable = await _domain_frameable(session, domain, headers, now)
                row.update(
                    image_url=og.image_url,
                    image_alt=og.image_alt,
                    og_title=og.og_title,
                    og_description=og.og_description,
                    og_site_name=og.og_site_name,
                    favicon_url=og.favicon_url,
                    byline=og.byline or doc.author,
                    frameable=frameable,
                )

        insert = pg_insert(DocumentMedia).values(row)
        insert = insert.on_conflict_do_nothing(index_elements=["document_id"])
        await session.execute(insert)
        written += 1

    await session.commit()
    log.info("feeds.media.backfilled", count=written)
    return written
