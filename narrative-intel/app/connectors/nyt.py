"""New York Times connector. Real via the Article Search API when NYT_API_KEY is
set (free key); inert (returns []) otherwise."""
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


class NytConnector(SourceConnector):
    name = "nyt"
    rate_limit = RateLimit(10, 60)  # NYT is strict

    def __init__(self) -> None:
        self.key = settings.nyt_api_key

    def fetch(self, query: str | None = None) -> list[dict]:
        if not self.key:
            return []
        params = {"q": (query or settings.x_query).strip(), "api-key": self.key, "sort": "newest"}
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get(
                    "https://api.nytimes.com/svc/search/v2/articlesearch.json", params=params)
                r.raise_for_status()
                return r.json().get("response", {}).get("docs", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        byline = (raw.get("byline", {}) or {}).get("original")
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(byline or "nyt"),
            display_name=byline or "The New York Times",
        )
        headline = (raw.get("headline", {}) or {}).get("main", "")
        text = f"{headline}. {raw.get('abstract', '')}".strip(". ").strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("_id") or raw.get("web_url", "")),
            text=text or headline,
            url=raw.get("web_url"),
            timestamp=_iso(raw.get("pub_date")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.key)}
