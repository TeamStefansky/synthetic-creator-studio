"""RSS connector. Real (keyless) when RSS_FEEDS is configured — parses feeds via
the stdlib; mock fixture otherwise."""
from __future__ import annotations

from datetime import datetime
from xml.etree import ElementTree as ET

import httpx

from ..config import settings
from ..schemas import NormalizedAuthor, NormalizedPost
from . import _mock
from .base import RateLimit, SourceConnector


class RssConnector(SourceConnector):
    name = "rss"
    rate_limit = RateLimit(60, 60)

    def __init__(self) -> None:
        self.feeds = [f.strip() for f in settings.rss_feeds.split(",") if f.strip()]

    def fetch(self) -> list[dict]:
        if not self.feeds:
            return _mock.rss_items()
        items: list[dict] = []
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            for url in self.feeds[:10]:
                try:
                    root = ET.fromstring(client.get(url).text)
                except Exception:
                    continue
                host = url.split("/")[2] if "//" in url else url
                for item in root.iter("item"):
                    g = item.findtext("guid") or item.findtext("link") or ""
                    items.append({
                        "guid": g,
                        "link": item.findtext("link"),
                        "published": item.findtext("pubDate"),
                        "title": item.findtext("title") or "",
                        "summary": item.findtext("description") or "",
                        "author": {"id": host, "name": host},
                    })
        return items or _mock.rss_items()

    def normalize(self, raw: dict) -> NormalizedPost:
        a = raw.get("author", {}) or {}
        author = NormalizedAuthor(source=self.name, source_author_id=str(a.get("id", "rss")), display_name=a.get("name"))
        ts = raw.get("published")
        parsed_ts = None
        if ts:
            try:
                parsed_ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                parsed_ts = None
        text = f"{raw.get('title', '')}. {raw.get('summary', '')}".strip()
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw.get("guid") or raw.get("link") or text[:64]),
            text=text,
            url=raw.get("link"),
            timestamp=parsed_ts,
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": not bool(self.feeds)}
