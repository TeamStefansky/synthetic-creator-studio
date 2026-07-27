"""GDELT 2.0 DOC API connector — the primary global wide net.

Free, updates every ~15 minutes, machine-translates 65 languages, returns
article metadata + URLs (no full text). We translate the watchlist's terms into
GDELT query syntax and window by time, narrowing the window (never an offset)
when a page hits the API's ``maxrecords`` cap.
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
from newsradar.connectors.http import make_client
from newsradar.connectors.resilience import TokenBucket, http_retry
from newsradar.db.models import MediaType, SourceType
from newsradar.logging import get_logger

log = get_logger(__name__)

GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
MAX_RECORDS = 250

# GDELT reports the original language as an English name; map the common ones.
_LANG_NAMES = {
    "english": "en",
    "hebrew": "he",
    "arabic": "ar",
    "french": "fr",
    "spanish": "es",
    "german": "de",
    "russian": "ru",
    "chinese": "zh",
    "persian": "fa",
    "turkish": "tr",
}


def _quote_if_phrase(term: str) -> str:
    term = term.strip()
    if " " in term and not (term.startswith('"') and term.endswith('"')):
        return f'"{term}"'
    return term


def build_gdelt_query(query: WatchlistQuery) -> str:
    """Translate a watchlist into a GDELT DOC query string.

    Positive terms are OR-combined (phrases quoted); exclusion terms become
    ``-term`` negations. GDELT treats a space as AND, so the OR group is wrapped
    in parentheses.
    """

    positives = [_quote_if_phrase(t.text) for t in query.positive_terms() if t.text.strip()]
    if not positives:
        raise ConnectorError("gdelt: watchlist has no positive terms to query")

    clause = positives[0] if len(positives) == 1 else "(" + " OR ".join(positives) + ")"

    negatives = [f"-{_quote_if_phrase(t.text)}" for t in query.exclusion_terms() if t.text.strip()]
    if negatives:
        clause = clause + " " + " ".join(negatives)
    return clause


def _parse_seendate(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%d%H%M%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return dt.datetime.strptime(value, fmt).replace(tzinfo=dt.UTC)
        except ValueError:
            continue
    return None


def _domain_from(article: dict[str, Any]) -> str:
    domain = article.get("domain")
    if domain:
        return str(domain).lower()
    return (urlsplit(str(article.get("url", ""))).hostname or "").lower()


def parse_gdelt_articles(payload: dict[str, Any]) -> list[RawDocument]:
    """Parse a GDELT DOC ``artlist`` JSON payload into raw documents."""

    articles = payload.get("articles") or []
    docs: list[RawDocument] = []
    for art in articles:
        url = art.get("url")
        if not url:
            continue
        lang_name = str(art.get("language", "")).strip().lower()
        docs.append(
            RawDocument(
                source_domain=_domain_from(art),
                url=str(url),
                external_id=str(url),
                title=art.get("title") or None,
                lang=_LANG_NAMES.get(lang_name),
                published_at=_parse_seendate(art.get("seendate")),
                media_type=MediaType.article,
                raw={
                    "connector": "gdelt",
                    "domain": art.get("domain"),
                    "language": art.get("language"),
                    "sourcecountry": art.get("sourcecountry"),
                    "socialimage": art.get("socialimage"),
                },
            )
        )
    return docs


class GdeltConnector(BaseConnector):
    """GDELT DOC 2.0 connector."""

    name = "gdelt"
    source_type = SourceType.aggregator
    default_interval_seconds = 15 * 60
    required_env = ()

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._bucket = TokenBucket(rate=1.0, capacity=3.0)
        self._max_depth = 4

    async def _fetch_window(
        self, query_str: str, start: dt.datetime, end: dt.datetime, depth: int
    ) -> list[RawDocument]:
        await self._bucket.acquire()
        params = {
            "query": query_str,
            "format": "json",
            "mode": "artlist",
            "maxrecords": str(MAX_RECORDS),
            "sort": "datedesc",
            "startdatetime": start.strftime("%Y%m%d%H%M%S"),
            "enddatetime": end.strftime("%Y%m%d%H%M%S"),
        }

        async def _do() -> dict[str, Any]:
            async with make_client(self._settings) as client:
                resp = await client.get(GDELT_DOC_URL, params=params)
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                return data

        payload = await http_retry(_do)()
        docs = parse_gdelt_articles(payload)

        # Narrow the window (never an offset) when we hit the record cap.
        if (
            len(docs) >= MAX_RECORDS
            and depth < self._max_depth
            and (end - start) > dt.timedelta(minutes=15)
        ):
            mid = start + (end - start) / 2
            first = await self._fetch_window(query_str, start, mid, depth + 1)
            second = await self._fetch_window(query_str, mid, end, depth + 1)
            return first + second
        return docs

    async def fetch(self, query: WatchlistQuery, since: dt.datetime) -> AsyncIterator[RawDocument]:
        query_str = build_gdelt_query(query)
        now = dt.datetime.now(dt.UTC)
        if since.tzinfo is None:
            since = since.replace(tzinfo=dt.UTC)
        seen: set[str] = set()
        for doc in await self._fetch_window(query_str, since, now, 0):
            if doc.url in seen:
                continue
            seen.add(doc.url)
            yield doc

    async def health_check(self) -> HealthStatus:
        try:
            async with make_client(self._settings) as client:
                resp = await client.get(
                    GDELT_DOC_URL,
                    params={
                        "query": "news",
                        "format": "json",
                        "mode": "artlist",
                        "maxrecords": "1",
                        "timespan": "15min",
                    },
                )
                resp.raise_for_status()
            return HealthStatus(healthy=True)
        except Exception as exc:  # noqa: BLE001 - health check reports, never raises
            return HealthStatus(healthy=False, detail=str(exc))
