"""Mastodon connector — free, keyless. Reads an instance's public timeline and
filters it by keyword client-side (the public timeline endpoint needs no auth).

Covers one instance's local+federated public feed (default mastodon.social); set
MASTODON_INSTANCE to change it. Network/format errors degrade to [].
"""
from __future__ import annotations

import re
from datetime import datetime

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector

_TAG = re.compile(r"<[^>]+>")


def _strip(html: str) -> str:
    return _TAG.sub(" ", html or "").replace("&amp;", "&").strip()


def _iso(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


def _terms(query: str | None) -> list[str]:
    if not query:
        return []
    cleaned = query.replace(" OR ", " ").replace(" AND ", " ").replace('"', " ")
    return [t.lower() for t in cleaned.split() if len(t) > 1]


class MastodonConnector(SourceConnector):
    name = "mastodon"
    rate_limit = RateLimit(60, 60)

    def __init__(self) -> None:
        self.instance = (settings.mastodon_instance or "mastodon.social").strip().rstrip("/")

    def fetch(self, query: str | None = None) -> list[dict]:
        url = f"https://{self.instance}/api/v1/timelines/public"
        try:
            with httpx.Client(timeout=20, follow_redirects=True) as client:
                r = client.get(url, params={"limit": "40"},
                               headers={"User-Agent": "narrative-intel/1.0"})
                r.raise_for_status()
                items = r.json() or []
        except Exception:
            return []
        terms = _terms(query)
        if terms:
            items = [it for it in items
                     if any(t in _strip(it.get("content", "")).lower() for t in terms)]
        return items

    def normalize(self, raw: dict) -> NormalizedPost:
        acc = raw.get("account", {}) or {}
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(acc.get("id", "unknown")),
            handle=acc.get("acct") or acc.get("username"),
            display_name=acc.get("display_name"),
            followers=acc.get("followers_count"),
            following=acc.get("following_count"),
            posts_count=acc.get("statuses_count"),
            created_at=_iso(acc.get("created_at")),
            avatar_url=acc.get("avatar"),
        )
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("id", "")),
            text=_strip(raw.get("content", "")),
            lang=raw.get("language"),
            url=raw.get("url") or raw.get("uri"),
            engagement={
                "reposts": raw.get("reblogs_count", 0),
                "likes": raw.get("favourites_count", 0),
                "replies": raw.get("replies_count", 0),
            },
            timestamp=_iso(raw.get("created_at")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": False}
