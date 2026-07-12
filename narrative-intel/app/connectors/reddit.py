"""Reddit connector — keyword search of public posts.

Best-effort keyless mode via the public `search.json` endpoint (no signup). Reddit
throttles/blocks unauthenticated server traffic, so if `REDDIT_CLIENT_ID` /
`REDDIT_CLIENT_SECRET` are set it authenticates via OAuth (free app) for reliable
access. Either way, network/format errors degrade to an empty result set.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector

_UA = "narrative-intel/1.0 (media monitoring)"


class RedditConnector(SourceConnector):
    name = "reddit"
    rate_limit = RateLimit(60, 60)

    def __init__(self) -> None:
        self.client_id = settings.reddit_client_id
        self.client_secret = settings.reddit_client_secret

    def _token(self, client: httpx.Client) -> str | None:
        if not (self.client_id and self.client_secret):
            return None
        r = client.post(
            "https://www.reddit.com/api/v1/access_token",
            data={"grant_type": "client_credentials"},
            auth=(self.client_id, self.client_secret),
            headers={"User-Agent": _UA},
        )
        r.raise_for_status()
        return r.json().get("access_token")

    def fetch(self, query: str | None = None) -> list[dict]:
        q = (query or settings.x_query).strip()
        if not q:
            return []
        params = {"q": q, "sort": "new", "limit": "50", "raw_json": "1"}
        try:
            with httpx.Client(timeout=20, follow_redirects=True) as client:
                token = self._token(client)
                if token:
                    base = "https://oauth.reddit.com/search"
                    headers = {"User-Agent": _UA, "Authorization": f"Bearer {token}"}
                else:
                    base = "https://www.reddit.com/search.json"
                    headers = {"User-Agent": _UA}
                r = client.get(base, params=params, headers=headers)
                r.raise_for_status()
                children = r.json().get("data", {}).get("children", [])
                return [c.get("data", {}) for c in children if c.get("data")]
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(raw.get("author", "unknown")),
            handle=raw.get("author"),
            display_name=raw.get("author"),
        )
        text = f"{raw.get('title', '')}. {raw.get('selftext', '')}".strip(". ").strip()
        perma = raw.get("permalink")
        ts = raw.get("created_utc")
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("name") or raw.get("id", "")),
            text=text or raw.get("title", ""),
            url=f"https://www.reddit.com{perma}" if perma else raw.get("url"),
            engagement={"score": raw.get("ups", 0), "replies": raw.get("num_comments", 0)},
            timestamp=datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None,
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": False,
                "auth": bool(self.client_id and self.client_secret)}
