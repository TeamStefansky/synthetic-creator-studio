"""Bluesky connector — free, keyless real search of a live social network.

Uses Bluesky's public AppView (public.api.bsky.app), which serves unauthenticated
read access to `app.bsky.feed.searchPosts`. No account or key required, so this
connector is always live. Network/format errors degrade to an empty result set.
"""
from __future__ import annotations

from datetime import datetime

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector

_ENDPOINT = "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"


def _parse_dt(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


class BlueskyConnector(SourceConnector):
    name = "bluesky"
    rate_limit = RateLimit(60, 60)

    def fetch(self, query: str | None = None) -> list[dict]:
        q = (query or settings.x_query).strip()
        if not q:
            return []
        params = {"q": q, "limit": "50", "sort": "latest"}
        try:
            with httpx.Client(timeout=20, follow_redirects=True) as client:
                r = client.get(_ENDPOINT, params=params,
                               headers={"User-Agent": "narrative-intel/1.0"})
                r.raise_for_status()
                return r.json().get("posts", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        a = raw.get("author", {}) or {}
        rec = raw.get("record", {}) or {}
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(a.get("did", "unknown")),
            handle=a.get("handle"),
            display_name=a.get("displayName"),
            created_at=_parse_dt(a.get("createdAt")),
            avatar_url=a.get("avatar"),
            raw=a or None,
        )
        uri = raw.get("uri", "")
        rkey = uri.rsplit("/", 1)[-1] if uri else ""
        url = f"https://bsky.app/profile/{author.handle}/post/{rkey}" if author.handle and rkey else None
        return NormalizedPost(
            source=self.name,
            source_post_id=str(uri or raw.get("cid", "")),
            text=rec.get("text", ""),
            lang=(rec.get("langs") or [None])[0],
            url=url,
            engagement={
                "likes": raw.get("likeCount", 0),
                "reposts": raw.get("repostCount", 0),
                "replies": raw.get("replyCount", 0),
                "quotes": raw.get("quoteCount", 0),
            },
            timestamp=_parse_dt(rec.get("createdAt")) or _parse_dt(raw.get("indexedAt")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": False}
