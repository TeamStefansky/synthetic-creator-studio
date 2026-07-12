"""Brave Search (news) connector. Real when BRAVE_API_KEY is set (free tier);
inert (returns []) otherwise."""
from __future__ import annotations

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector


class BraveConnector(SourceConnector):
    name = "brave"
    rate_limit = RateLimit(60, 60)

    def __init__(self) -> None:
        self.key = settings.brave_api_key

    def fetch(self, query: str | None = None) -> list[dict]:
        if not self.key:
            return []
        params = {"q": (query or settings.x_query).strip(), "count": "50"}
        headers = {"Accept": "application/json", "X-Subscription-Token": self.key}
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get("https://api.search.brave.com/res/v1/news/search",
                               params=params, headers=headers)
                r.raise_for_status()
                return r.json().get("results", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        host = (raw.get("meta_url", {}) or {}).get("hostname") or "brave"
        author = NormalizedAuthor(source=self.name, source_author_id=str(host), display_name=host)
        text = f"{raw.get('title', '')}. {raw.get('description', '')}".strip(". ").strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("url") or text[:64]),
            text=text or raw.get("title", ""),
            url=raw.get("url"),
            timestamp=None,  # Brave returns relative "age" strings, not timestamps
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.key)}
