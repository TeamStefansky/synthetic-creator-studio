"""Hacker News connector — free, keyless keyword search via the Algolia HN API.

https://hn.algolia.com/api — no key, searches stories/comments by keyword.
Network/format errors degrade to an empty result set.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector

_ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date"


class HackerNewsConnector(SourceConnector):
    name = "hackernews"
    rate_limit = RateLimit(60, 60)

    def fetch(self, query: str | None = None) -> list[dict]:
        q = (query or settings.x_query).strip()
        if not q:
            return []
        params = {"query": q, "tags": "story", "hitsPerPage": "50"}
        try:
            with httpx.Client(timeout=20, follow_redirects=True) as client:
                r = client.get(_ENDPOINT, params=params,
                               headers={"User-Agent": "narrative-intel/1.0"})
                r.raise_for_status()
                return r.json().get("hits", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(raw.get("author", "unknown")),
            handle=raw.get("author"),
            display_name=raw.get("author"),
        )
        oid = raw.get("objectID", "")
        text = raw.get("title") or raw.get("story_text") or raw.get("comment_text") or ""
        ts = raw.get("created_at_i")
        return NormalizedPost(
            source=self.name,
            source_post_id=str(oid),
            text=text,
            url=raw.get("url") or (f"https://news.ycombinator.com/item?id={oid}" if oid else None),
            engagement={"points": raw.get("points", 0), "replies": raw.get("num_comments", 0)},
            timestamp=datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None,
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": False}
