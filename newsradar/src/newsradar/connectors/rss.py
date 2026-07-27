"""RSS connector — the highest-quality named-outlet coverage.

The feed list lives in ``config/feeds.yaml``. ``feedparser`` parses the feed and
``trafilatura`` (in the pipeline) extracts full text later where licensing
allows. Per-feed failures are logged and skipped; they never abort the run.
"""

from __future__ import annotations

import calendar
import datetime as dt
from collections.abc import AsyncIterator, Iterable
from typing import Any

import feedparser

from newsradar.config import Settings, get_settings
from newsradar.connectors.base import (
    BaseConnector,
    HealthStatus,
    RawDocument,
    WatchlistQuery,
)
from newsradar.connectors.config_files import feeds_path, load_yaml_list
from newsradar.connectors.http import make_client
from newsradar.connectors.resilience import TokenBucket, http_retry
from newsradar.db.models import MediaType, SourceType
from newsradar.logging import get_logger

log = get_logger(__name__)


def _struct_to_utc(value: Any) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromtimestamp(calendar.timegm(value), tz=dt.UTC)
    except (TypeError, ValueError, OverflowError):
        return None


def _entry_body_html(entry: Any) -> str | None:
    content = getattr(entry, "content", None)
    if content:
        first = content[0]
        value = first.get("value") if isinstance(first, dict) else getattr(first, "value", None)
        if value:
            return str(value)
    summary = getattr(entry, "summary", None)
    return str(summary) if summary else None


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _entry_media(entry: Any) -> dict[str, Any] | None:
    """Extract a presentation image from an RSS entry.

    Reads ``media:content`` / ``media:thumbnail`` / ``enclosure`` in that order
    and returns ``{image_url, image_width, image_height, image_alt}`` or ``None``.
    Only the image URL is captured — images are never downloaded or re-hosted.
    """

    def _pick(items: Any) -> dict[str, Any] | None:
        for item in items or []:
            url = item.get("url") if isinstance(item, dict) else None
            medium = (item.get("medium") or item.get("type") or "") if isinstance(item, dict) else ""
            if url and (not medium or "image" in str(medium)):
                return {
                    "image_url": str(url),
                    "image_width": _as_int(item.get("width")),
                    "image_height": _as_int(item.get("height")),
                    "image_alt": item.get("title") or item.get("alt") or None,
                }
        return None

    found = _pick(getattr(entry, "media_content", None)) or _pick(
        getattr(entry, "media_thumbnail", None)
    )
    if found:
        return found
    for enc in getattr(entry, "enclosures", None) or []:
        href = enc.get("href") if isinstance(enc, dict) else None
        etype = enc.get("type", "") if isinstance(enc, dict) else ""
        if href and str(etype).startswith("image"):
            return {
                "image_url": str(href),
                "image_width": None,
                "image_height": None,
                "image_alt": None,
            }
    return None


def parse_feed(content: str | bytes, feed_meta: dict[str, Any]) -> list[RawDocument]:
    """Parse feed bytes into raw documents, tagging them with the feed's metadata."""

    parsed = feedparser.parse(content)
    domain = str(feed_meta.get("source_domain", "")).lower()
    lang = feed_meta.get("lang")

    docs: list[RawDocument] = []
    for entry in parsed.entries:
        link = getattr(entry, "link", None)
        if not link:
            continue
        published = _struct_to_utc(
            getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
        )
        body_html = _entry_body_html(entry)
        raw: dict[str, Any] = {
            "connector": "rss",
            "feed_domain": domain,
            "country": feed_meta.get("country"),
            "tier": feed_meta.get("tier"),
        }
        media = _entry_media(entry)
        if media is not None:
            raw["media"] = media
        docs.append(
            RawDocument(
                source_domain=domain,
                url=str(link),
                external_id=str(getattr(entry, "id", "") or link),
                title=getattr(entry, "title", None) or None,
                body_html=body_html,
                lang=lang,
                published_at=published,
                author=getattr(entry, "author", None) or None,
                media_type=MediaType.article,
                raw=raw,
            )
        )
    return docs


class RssConnector(BaseConnector):
    """Polls the outlets listed in ``config/feeds.yaml``."""

    name = "rss"
    source_type = SourceType.news
    default_interval_seconds = 10 * 60
    required_env = ()

    def __init__(
        self,
        settings: Settings | None = None,
        feeds: list[dict[str, Any]] | None = None,
        *,
        poll_subscriptions: bool = True,
    ) -> None:
        self._settings = settings or get_settings()
        self._feeds = feeds if feeds is not None else load_yaml_list(feeds_path(self._settings))
        self._bucket = TokenBucket(rate=5.0, capacity=10.0)
        # Poll DB-backed feed_subscriptions (P5) in addition to config/feeds.yaml.
        # Disabled when a static feed list is injected (tests) so behaviour is
        # unchanged for the config-file path.
        self._poll_subscriptions = poll_subscriptions and feeds is None

    def _selected_feeds(self, query: WatchlistQuery) -> Iterable[dict[str, Any]]:
        for feed in self._feeds:
            if query.lang_filter and feed.get("lang") not in query.lang_filter:
                continue
            if query.country_filter and feed.get("country") not in query.country_filter:
                continue
            yield feed

    async def _fetch_feed(self, url: str) -> str | None:
        await self._bucket.acquire()

        async def _do() -> str:
            async with make_client(self._settings) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.text

        return await http_retry(_do)()

    async def fetch(self, query: WatchlistQuery, since: dt.datetime) -> AsyncIterator[RawDocument]:
        if since.tzinfo is None:
            since = since.replace(tzinfo=dt.UTC)
        for feed in self._selected_feeds(query):
            url = feed.get("url")
            if not url:
                continue
            try:
                content = await self._fetch_feed(str(url))
            except Exception as exc:  # noqa: BLE001 - one bad feed must not abort the run
                log.warning("connector.rss.feed_failed", feed=url, error=str(exc))
                continue
            if content is None:
                continue
            for doc in parse_feed(content, feed):
                if doc.published_at is not None and doc.published_at < since:
                    continue
                yield doc

        # P5: also poll DB-backed feed subscriptions (conditional GET + failure tracking).
        if self._poll_subscriptions:
            async for doc in self._fetch_subscriptions(query, since):
                yield doc

    async def _fetch_subscriptions(
        self, query: WatchlistQuery, since: dt.datetime
    ) -> AsyncIterator[RawDocument]:
        # Imported lazily to keep the connector import-light and DB-free until used.
        from newsradar.db.session import get_sessionmaker
        from newsradar.feeds.http import HttpFetcher
        from newsradar.feeds.polling import poll_subscriptions

        factory = get_sessionmaker()
        fetcher = HttpFetcher(self._settings)
        try:
            async with factory() as session:
                docs = await poll_subscriptions(
                    session,
                    fetcher,
                    since,
                    lang_filter=query.lang_filter,
                    country_filter=query.country_filter,
                )
        except Exception as exc:  # noqa: BLE001 - subscription polling must not abort the run
            log.warning("connector.rss.subscriptions_failed", error=str(exc))
            return
        finally:
            await fetcher.aclose()
        for doc in docs:
            yield doc

    async def health_check(self) -> HealthStatus:
        if not self._feeds:
            return HealthStatus(healthy=False, detail="no feeds configured")
        return HealthStatus(healthy=True, detail=f"{len(self._feeds)} feeds")
