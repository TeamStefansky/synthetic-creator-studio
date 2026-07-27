"""YouTube Data API v3 connector.

Uses ``search.list`` (100 quota units) + ``videos.list`` (1 unit) via the REST
endpoints, and stops once the estimated daily quota usage exceeds
``YOUTUBE_DAILY_QUOTA_BUDGET``. Guarded by ``YOUTUBE_API_KEY``.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator
from typing import Any

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

SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
SEARCH_COST = 100
VIDEOS_COST = 1
MAX_RESULTS = 50


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


def _search_query(query: WatchlistQuery) -> str:
    positives = [t.text for t in query.positive_terms() if t.text.strip()]
    if not positives:
        raise ConnectorError("youtube: watchlist has no positive terms to query")
    return " | ".join(positives)  # YouTube treats '|' as OR


def parse_youtube(
    search_payload: dict[str, Any], videos_payload: dict[str, Any]
) -> list[RawDocument]:
    """Combine a ``search.list`` and ``videos.list`` payload into raw documents."""

    stats_by_id: dict[str, dict[str, Any]] = {}
    for item in videos_payload.get("items", []):
        vid = item.get("id")
        if isinstance(vid, str):
            stats_by_id[vid] = item

    docs: list[RawDocument] = []
    for item in search_payload.get("items", []):
        vid = (item.get("id") or {}).get("videoId")
        if not vid:
            continue
        snippet = item.get("snippet") or {}
        video_detail = stats_by_id.get(vid, {})
        statistics = video_detail.get("statistics") or {}
        docs.append(
            RawDocument(
                source_domain="youtube.com",
                url=f"https://www.youtube.com/watch?v={vid}",
                external_id=vid,
                title=snippet.get("title") or None,
                body_text=snippet.get("description") or None,
                lang=(video_detail.get("snippet", {}) or {}).get("defaultAudioLanguage")
                or snippet.get("defaultLanguage"),
                published_at=_parse_iso(snippet.get("publishedAt")),
                author=snippet.get("channelTitle") or None,
                media_type=MediaType.video,
                engagement={
                    "views": statistics.get("viewCount"),
                    "likes": statistics.get("likeCount"),
                    "comments": statistics.get("commentCount"),
                },
                raw={
                    "connector": "youtube",
                    "channelId": snippet.get("channelId"),
                    "tags": (video_detail.get("snippet", {}) or {}).get("tags"),
                },
            )
        )
    return docs


class YouTubeConnector(BaseConnector):
    """YouTube Data API v3 connector, budget-aware on quota."""

    name = "youtube"
    source_type = SourceType.social
    default_interval_seconds = 60 * 60
    required_env = ("youtube_api_key",)

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._bucket = TokenBucket(rate=2.0, capacity=4.0)

    async def _get(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        await self._bucket.acquire()

        async def _do() -> dict[str, Any]:
            async with make_client(self._settings) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
                return data

        return await http_retry(_do)()

    async def fetch(self, query: WatchlistQuery, since: dt.datetime) -> AsyncIterator[RawDocument]:
        key = self._settings.youtube_api_key
        if not key:
            raise ConnectorError("youtube: YOUTUBE_API_KEY not configured")
        if since.tzinfo is None:
            since = since.replace(tzinfo=dt.UTC)

        budget = self._settings.youtube_daily_quota_budget
        spent = 0
        page_token: str | None = None

        while spent + SEARCH_COST + VIDEOS_COST <= budget:
            search_params = {
                "key": key,
                "part": "snippet",
                "type": "video",
                "order": "date",
                "maxResults": str(MAX_RESULTS),
                "q": _search_query(query),
                "publishedAfter": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            if page_token:
                search_params["pageToken"] = page_token
            search_payload = await self._get(SEARCH_URL, search_params)
            spent += SEARCH_COST

            ids: list[str] = [
                str(vid)
                for item in search_payload.get("items", [])
                if (vid := (item.get("id") or {}).get("videoId"))
            ]
            videos_payload: dict[str, Any] = {"items": []}
            if ids:
                videos_payload = await self._get(
                    VIDEOS_URL,
                    {
                        "key": key,
                        "part": "snippet,statistics",
                        "id": ",".join(ids),
                    },
                )
                spent += VIDEOS_COST

            for doc in parse_youtube(search_payload, videos_payload):
                yield doc

            page_token = search_payload.get("nextPageToken")
            if not page_token:
                break

        if spent + SEARCH_COST + VIDEOS_COST > budget:
            log.info("connector.youtube.budget_reached", spent=spent, budget=budget)

    async def health_check(self) -> HealthStatus:
        if not self._settings.youtube_api_key:
            return HealthStatus(healthy=False, detail="YOUTUBE_API_KEY not set")
        try:
            await self._get(
                SEARCH_URL,
                {
                    "key": self._settings.youtube_api_key,
                    "part": "snippet",
                    "type": "video",
                    "maxResults": "1",
                    "q": "news",
                },
            )
            return HealthStatus(healthy=True)
        except Exception as exc:  # noqa: BLE001
            return HealthStatus(healthy=False, detail=str(exc))
