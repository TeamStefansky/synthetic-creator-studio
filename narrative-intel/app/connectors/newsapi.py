"""NewsAPI connector. Real via newsapi.org when NEWSAPI_KEY is set; mock otherwise."""
from __future__ import annotations

from datetime import datetime

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from . import _mock
from .base import RateLimit, SourceConnector


class NewsApiConnector(SourceConnector):
    name = "newsapi"
    rate_limit = RateLimit(100, 86400)

    def __init__(self) -> None:
        self.key = settings.newsapi_key

    def fetch(self) -> list[dict]:
        if not self.key:
            return _mock.newsapi_items()
        params = {"q": settings.x_query, "pageSize": "50", "language": "en", "apiKey": self.key}
        with httpx.Client(timeout=15) as client:
            r = client.get("https://newsapi.org/v2/everything", params=params)
            r.raise_for_status()
            return r.json().get("articles", [])

    def normalize(self, raw: dict) -> NormalizedPost:
        src = raw.get("source", {}) or {}
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(src.get("id") or src.get("name") or "newsapi"),
            display_name=src.get("name"),
        )
        ts = raw.get("publishedAt")
        parsed_ts = None
        if ts:
            try:
                parsed_ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                parsed_ts = None
        text = f"{raw.get('title', '')}. {raw.get('description', '')}".strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("url") or text[:64]),
            text=text,
            url=raw.get("url"),
            timestamp=parsed_ts,
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.key)}
