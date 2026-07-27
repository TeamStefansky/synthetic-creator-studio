"""Perigon connector — paid REST API with rich metadata.

Guarded by ``PERIGON_API_KEY`` (and ``PERIGON_ENABLED``); optional for local dev.
Perigon's native sentiment / entities / lat-lon are mapped straight into
``documents.raw`` for P2 to consume rather than being discarded here.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import urlsplit

from newsradar.config import Settings, get_settings
from newsradar.connectors.base import (
    BaseConnector,
    ConnectorError,
    HealthStatus,
    RawDocument,
    WatchlistQuery,
)
from newsradar.connectors.gdelt import build_gdelt_query
from newsradar.connectors.http import make_client
from newsradar.connectors.resilience import TokenBucket, http_retry
from newsradar.db.models import MediaType, SourceType
from newsradar.logging import get_logger

log = get_logger(__name__)

PERIGON_URL = "https://api.perigon.io/v1/all"
PAGE_SIZE = 100


def _parse_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def _domain_of(article: dict[str, Any]) -> str:
    source = article.get("source") or {}
    domain = source.get("domain") if isinstance(source, dict) else None
    if domain:
        return str(domain).lower()
    return (urlsplit(str(article.get("url", ""))).hostname or "").lower()


def parse_perigon_response(payload: dict[str, Any]) -> list[RawDocument]:
    """Parse a Perigon ``/v1/all`` response into raw documents."""

    articles = payload.get("articles") or []
    docs: list[RawDocument] = []
    for art in articles:
        url = art.get("url")
        if not url:
            continue
        docs.append(
            RawDocument(
                source_domain=_domain_of(art),
                url=str(url),
                external_id=str(art.get("articleId") or url),
                title=art.get("title") or None,
                body_text=art.get("content") or None,
                summary=art.get("description") or None,
                lang=(art.get("language") or None),
                published_at=_parse_iso(art.get("pubDate")),
                author=", ".join(art.get("authorsByline", []))
                if isinstance(art.get("authorsByline"), list)
                else (art.get("authorsByline") or None),
                media_type=MediaType.article,
                raw={
                    "connector": "perigon",
                    "sentiment": art.get("sentiment"),
                    "entities": art.get("entities"),
                    "locations": art.get("locations"),
                    "matchedAuthors": art.get("matchedAuthors"),
                    "topics": art.get("topics"),
                    "categories": art.get("categories"),
                },
            )
        )
    return docs


class PerigonConnector(BaseConnector):
    """Perigon paid news API connector."""

    name = "perigon"
    source_type = SourceType.aggregator
    default_interval_seconds = 15 * 60
    required_env = ("perigon_api_key",)

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._bucket = TokenBucket(rate=2.0, capacity=4.0)

    async def fetch(self, query: WatchlistQuery, since: dt.datetime) -> AsyncIterator[RawDocument]:
        if not self._settings.perigon_api_key:
            raise ConnectorError("perigon: PERIGON_API_KEY not configured")
        if since.tzinfo is None:
            since = since.replace(tzinfo=dt.UTC)
        params = {
            "apiKey": self._settings.perigon_api_key,
            "q": build_gdelt_query(query),
            "from": since.strftime("%Y-%m-%dT%H:%M:%S"),
            "size": str(PAGE_SIZE),
            "sortBy": "date",
        }
        if query.lang_filter:
            params["language"] = ",".join(query.lang_filter)

        # Fold enabled api_sources (Perigon) country/lang/extra scope in; DB optional.
        try:
            from newsradar.connectors.api_sources import (
                apply_scope_to_perigon_params,
                load_api_source_scope,
            )
            from newsradar.db.session import get_sessionmaker

            async with get_sessionmaker()() as session:
                scope = await load_api_source_scope(session, "perigon")
            if not scope.empty:
                params = apply_scope_to_perigon_params(params, scope)
        except Exception as exc:  # noqa: BLE001 - scope is optional
            log.debug("connector.perigon.scope_unavailable", error=str(exc))

        await self._bucket.acquire()

        async def _do() -> dict[str, Any]:
            async with make_client(self._settings) as client:
                resp = await client.get(PERIGON_URL, params=params)
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                return data

        payload = await http_retry(_do)()
        for doc in parse_perigon_response(payload):
            yield doc

    async def health_check(self) -> HealthStatus:
        if not self._settings.perigon_api_key:
            return HealthStatus(healthy=False, detail="PERIGON_API_KEY not set")
        try:
            async with make_client(self._settings) as client:
                resp = await client.get(
                    PERIGON_URL,
                    params={"apiKey": self._settings.perigon_api_key, "size": "1"},
                )
                resp.raise_for_status()
            return HealthStatus(healthy=True)
        except Exception as exc:  # noqa: BLE001
            return HealthStatus(healthy=False, detail=str(exc))
