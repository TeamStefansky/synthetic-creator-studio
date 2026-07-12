"""Telegram connector (mock). Real channel ingestion needs a bot/user session;
kept as a mock connector for the MVP so the pipeline is complete end-to-end."""
from __future__ import annotations

from datetime import datetime

from ..schemas import NormalizedAuthor, NormalizedPost
from . import _mock
from .base import RateLimit, SourceConnector


class TelegramConnector(SourceConnector):
    name = "telegram"
    rate_limit = RateLimit(30, 60)

    def fetch(self, query: str | None = None) -> list[dict]:
        # Telegram has no public keyword-search API for a bot token: real
        # ingestion requires an MTProto user session already joined to the target
        # channels. Kept as a mock connector so the pipeline is complete E2E.
        return _mock.telegram_items()

    def normalize(self, raw: dict) -> NormalizedPost:
        a = raw.get("author", {}) or {}
        author = NormalizedAuthor(
            source=self.name,
            source_author_id=str(a.get("id", raw.get("channel", "unknown"))),
            handle=a.get("username"),
            display_name=a.get("title"),
        )
        ts = raw.get("date")
        return NormalizedPost(
            source=self.name,
            source_post_id=str(raw["message_id"]),
            text=raw.get("text", ""),
            url=f"https://t.me/{raw.get('channel')}/{raw['message_id']}",
            timestamp=datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None,
            author=author,
            raw=raw,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "mock": True}
