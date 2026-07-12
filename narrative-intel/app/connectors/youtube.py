"""YouTube connector. Real via YouTube Data API v3 when YOUTUBE_API_KEY is set
(free daily quota); inert (returns []) otherwise."""
from __future__ import annotations

from datetime import datetime

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector


def _iso(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


class YouTubeConnector(SourceConnector):
    name = "youtube"
    rate_limit = RateLimit(100, 86400)

    def __init__(self) -> None:
        self.key = settings.youtube_api_key

    def fetch(self, query: str | None = None) -> list[dict]:
        if not self.key:
            return []
        params = {
            "part": "snippet", "q": (query or settings.x_query).strip(),
            "type": "video", "order": "date", "maxResults": "50", "key": self.key,
        }
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get("https://www.googleapis.com/youtube/v3/search", params=params)
                r.raise_for_status()
                return r.json().get("items", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        sn = raw.get("snippet", {}) or {}
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(sn.get("channelId", "youtube")),
            handle=sn.get("channelTitle"),
            display_name=sn.get("channelTitle"),
        )
        vid = (raw.get("id", {}) or {}).get("videoId", "")
        text = f"{sn.get('title', '')}. {sn.get('description', '')}".strip(". ").strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(vid or sn.get("title", "")),
            text=text or sn.get("title", ""),
            url=f"https://www.youtube.com/watch?v={vid}" if vid else None,
            timestamp=_iso(sn.get("publishedAt")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.key)}
