"""GDELT connector — free, keyless keyword search across global online news/web.

GDELT's DOC 2.0 API (https://api.gdeltproject.org/api/v2/doc/doc) indexes news
and web articles worldwide and supports keyword queries with no API key, so this
connector is always "real": whatever keywords the user types are searched against
live published content. Network/format errors degrade to an empty result set.
"""
from __future__ import annotations

from datetime import datetime

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from .base import RateLimit, SourceConnector

_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc"


def _parse_seendate(v: str | None) -> datetime | None:
    if not v:
        return None
    for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%d%H%M%S"):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None


class GdeltConnector(SourceConnector):
    name = "gdelt"
    rate_limit = RateLimit(60, 60)

    def fetch(self, query: str | None = None) -> list[dict]:
        q = (query or settings.x_query).strip()
        if not q:
            return []
        params = {
            "query": q,
            "mode": "artlist",
            "format": "json",
            "maxrecords": str(settings.gdelt_max_records),
            "sort": "datedesc",
            "timespan": settings.gdelt_timespan,
        }
        try:
            with httpx.Client(timeout=20, follow_redirects=True) as client:
                r = client.get(_ENDPOINT, params=params,
                               headers={"User-Agent": "narrative-intel/1.0"})
                r.raise_for_status()
                # GDELT sometimes returns an HTML/plain error instead of JSON.
                if "application/json" not in r.headers.get("content-type", ""):
                    return []
                return r.json().get("articles", []) or []
        except Exception:
            return []

    def normalize(self, raw: dict) -> NormalizedPost:
        domain = raw.get("domain") or "gdelt"
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(domain),
            display_name=domain,
        )
        title = raw.get("title", "") or ""
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("url") or title[:64]),
            text=title,
            lang=(raw.get("language") or None),
            url=raw.get("url"),
            timestamp=_parse_seendate(raw.get("seendate")),
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        # Keyless — always live (no mock path).
        return {"source": self.name, "ok": True, "mock": False}
