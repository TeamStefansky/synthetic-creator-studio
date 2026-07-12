"""The Guardian connector. Real via the Open Platform API when GUARDIAN_API_KEY
is set (free key); inert (returns []) otherwise."""
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


class GuardianConnector(SourceConnector):
    name = "guardian"
    rate_limit = RateLimit(60, 60)

    def __init__(self) -> None:
        self.key = settings.guardian_api_key

    def fetch(self, query: str | None = None) -> list[dict]:
        if not self.key:
            return []
        params = {
            "q": (query or settings.x_query).strip(), "api-key": self.key,
            "show-fields": "trailText,byline", "page-size": "50", "order-by": "newest",
        }
        try:
            with httpx.Client(timeout=20) as client:
                r = client.get("https://content.guardianapis.com/search", params=params)
                r.raise_for_status()
                return r.json().get("response", {}).get("results", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        fields = raw.get("fields", {}) or {}
        byline = fields.get("byline")
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(byline or "the-guardian"),
            display_name=byline or "The Guardian",
        )
        text = f"{raw.get('webTitle', '')}. {fields.get('trailText', '')}".strip(". ").strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("id") or raw.get("webUrl", "")),
            text=text or raw.get("webTitle", ""),
            url=raw.get("webUrl"),
            timestamp=_iso(raw.get("webPublicationDate")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.key)}
