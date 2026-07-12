"""GNews connector. Real via gnews.io when GNEWS_API_KEY is set (free tier);
inert (returns []) otherwise."""
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


class GNewsConnector(SourceConnector):
    name = "gnews"
    rate_limit = RateLimit(100, 86400)

    def __init__(self) -> None:
        self.key = settings.gnews_api_key

    def fetch(self, query: str | None = None) -> list[dict]:
        if not self.key:
            return []
        params = {"q": (query or settings.x_query).strip(), "token": self.key,
                  "lang": "en", "max": "50", "sortby": "publishedAt"}
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get("https://gnews.io/api/v4/search", params=params)
                r.raise_for_status()
                return r.json().get("articles", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        src = (raw.get("source", {}) or {}).get("name")
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(src or "gnews"),
            display_name=src,
        )
        text = f"{raw.get('title', '')}. {raw.get('description', '')}".strip(". ").strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("url") or text[:64]),
            text=text or raw.get("title", ""),
            url=raw.get("url"),
            timestamp=_iso(raw.get("publishedAt")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.key)}
