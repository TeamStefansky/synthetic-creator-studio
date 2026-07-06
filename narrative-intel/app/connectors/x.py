"""X (Twitter) connector. Real via X API v2 when X_BEARER_TOKEN is set; mock otherwise."""
from __future__ import annotations

from datetime import datetime

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from . import _mock
from .base import RateLimit, SourceConnector


def _parse_dt(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None


class XConnector(SourceConnector):
    name = "x"
    rate_limit = RateLimit(180, 900)  # X recent-search style window

    def __init__(self, query: str | None = None) -> None:
        self.query = query or settings.x_query
        self.token = settings.x_bearer_token

    def fetch(self) -> list[dict]:
        if not self.token:
            return _mock.x_items()
        params = {
            "query": f"{self.query} -is:retweet",
            "max_results": "100",
            "tweet.fields": "public_metrics,created_at",
            "expansions": "author_id",
            "user.fields": "created_at,public_metrics,verified,description",
        }
        headers = {"Authorization": f"Bearer {self.token}"}
        with httpx.Client(timeout=15) as client:
            r = client.get("https://api.twitter.com/2/tweets/search/recent", params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
        users = {u["id"]: u for u in data.get("includes", {}).get("users", [])}
        return [{**t, "author": users.get(t.get("author_id"), {})} for t in data.get("data", [])]

    def normalize(self, raw: dict) -> NormalizedPost:
        a = raw.get("author", {}) or {}
        pm = a.get("public_metrics", {}) or {}
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(a.get("id", raw.get("author_id", "unknown"))),
            handle=a.get("username"),
            display_name=a.get("name"),
            created_at=_parse_dt(a.get("created_at")),
            followers=pm.get("followers_count"),
            following=pm.get("following_count"),
            posts_count=pm.get("tweet_count"),
            bio=a.get("description"),
            raw=a or None,
        )
        m = raw.get("public_metrics", {}) or {}
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw["id"]),
            text=raw.get("text", ""),
            url=f"https://x.com/{author.handle}/status/{raw['id']}" if author.handle else None,
            engagement={
                "likes": m.get("like_count", 0),
                "reposts": m.get("retweet_count", 0),
                "replies": m.get("reply_count", 0),
                "quotes": m.get("quote_count", 0),
            },
            timestamp=_parse_dt(raw.get("created_at")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.token)}
