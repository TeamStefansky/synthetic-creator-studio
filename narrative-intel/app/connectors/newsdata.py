"""NewsData.io connector. Real when NEWSDATA_API_KEY is set (free tier); inert
(returns []) otherwise."""
from __future__ import annotations

from datetime import datetime

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector


def _dt(v: str | None) -> datetime | None:
    if not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(v[:19], fmt)
        except ValueError:
            continue
    return None


class NewsDataConnector(SourceConnector):
    name = "newsdata"
    rate_limit = RateLimit(30, 900)

    def __init__(self) -> None:
        self.key = settings.newsdata_api_key

    def fetch(self, query: str | None = None) -> list[dict]:
        if not self.key:
            return []
        params = {"apikey": self.key, "q": (query or settings.x_query).strip(), "language": "en"}
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get("https://newsdata.io/api/1/news", params=params)
                r.raise_for_status()
                return r.json().get("results", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        src = raw.get("source_id")
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(src or "newsdata"),
            display_name=src,
        )
        text = f"{raw.get('title', '')}. {raw.get('description', '')}".strip(". ").strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("article_id") or raw.get("link", "")),
            text=text or raw.get("title", ""),
            url=raw.get("link"),
            timestamp=_dt(raw.get("pubDate")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.key)}
