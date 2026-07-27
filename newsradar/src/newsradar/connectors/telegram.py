"""Telegram connector — public channels via MTProto (Telethon).

Read-only: it never sends messages and never joins private channels. Guarded by
``TELEGRAM_API_ID`` / ``TELEGRAM_API_HASH`` / ``TELEGRAM_SESSION`` (a string
session). The channel list lives in ``config/telegram_channels.yaml``.

Telethon is imported lazily inside the network methods so the module imports
cleanly (and tests exercise :func:`message_to_raw`) without a live session.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator
from typing import Any, Protocol

from newsradar.config import Settings, get_settings
from newsradar.connectors.base import (
    BaseConnector,
    ConnectorError,
    HealthStatus,
    RawDocument,
    WatchlistQuery,
)
from newsradar.connectors.config_files import load_yaml_list, telegram_channels_path
from newsradar.db.models import MediaType, SourceType
from newsradar.logging import get_logger

log = get_logger(__name__)


class _MessageLike(Protocol):
    """The subset of a Telethon message that :func:`message_to_raw` reads."""

    id: int
    message: str | None
    date: dt.datetime | None


def _channel_username(channel_meta: dict[str, Any]) -> str:
    username = channel_meta.get("username") or channel_meta.get("channel") or ""
    return str(username).lstrip("@")


def message_to_raw(message: _MessageLike, channel_meta: dict[str, Any]) -> RawDocument:
    """Convert a Telegram message into a :class:`RawDocument`."""

    username = _channel_username(channel_meta)
    text = getattr(message, "message", None) or getattr(message, "text", None)
    date = getattr(message, "date", None)
    if date is not None and date.tzinfo is None:
        date = date.replace(tzinfo=dt.UTC)

    title = None
    if text:
        title = text.strip().splitlines()[0][:200]

    return RawDocument(
        source_domain=f"t.me/{username}" if username else "t.me",
        url=f"https://t.me/{username}/{message.id}",
        external_id=f"{username}:{message.id}",
        title=title,
        body_text=text,
        lang=channel_meta.get("lang"),
        published_at=date,
        author=channel_meta.get("title") or username or None,
        media_type=MediaType.post,
        engagement={
            "views": getattr(message, "views", None),
            "forwards": getattr(message, "forwards", None),
        },
        raw={
            "connector": "telegram",
            "channel": username,
            "country": channel_meta.get("country"),
        },
    )


class TelegramConnector(BaseConnector):
    """Reads public Telegram channels listed in ``config/telegram_channels.yaml``."""

    name = "telegram"
    source_type = SourceType.social
    default_interval_seconds = 5 * 60
    required_env = ("telegram_api_id", "telegram_api_hash", "telegram_session")

    def __init__(
        self, settings: Settings | None = None, channels: list[dict[str, Any]] | None = None
    ) -> None:
        self._settings = settings or get_settings()
        self._channels = (
            channels
            if channels is not None
            else load_yaml_list(telegram_channels_path(self._settings))
        )

    def _make_client(self) -> Any:
        from telethon import TelegramClient  # lazy: heavy import, only when running
        from telethon.sessions import StringSession

        return TelegramClient(
            StringSession(self._settings.telegram_session),
            int(self._settings.telegram_api_id),
            self._settings.telegram_api_hash,
        )

    async def fetch(self, query: WatchlistQuery, since: dt.datetime) -> AsyncIterator[RawDocument]:
        if not (
            self._settings.telegram_api_id
            and self._settings.telegram_api_hash
            and self._settings.telegram_session
        ):
            raise ConnectorError("telegram: credentials not configured")
        if since.tzinfo is None:
            since = since.replace(tzinfo=dt.UTC)

        client = self._make_client()
        await client.connect()
        try:
            for channel in self._channels:
                username = _channel_username(channel)
                if not username:
                    continue
                try:
                    async for message in client.iter_messages(username, offset_date=None):
                        date = getattr(message, "date", None)
                        if date is not None and date.tzinfo is None:
                            date = date.replace(tzinfo=dt.UTC)
                        if date is not None and date < since:
                            break
                        text = getattr(message, "message", None) or getattr(message, "text", None)
                        if not text:
                            continue
                        yield message_to_raw(message, channel)
                except Exception as exc:  # noqa: BLE001 - one bad channel must not abort
                    log.warning(
                        "connector.telegram.channel_failed", channel=username, error=str(exc)
                    )
                    continue
        finally:
            await client.disconnect()

    async def health_check(self) -> HealthStatus:
        if not (
            self._settings.telegram_api_id
            and self._settings.telegram_api_hash
            and self._settings.telegram_session
        ):
            return HealthStatus(healthy=False, detail="telegram credentials not set")
        try:
            client = self._make_client()
            await client.connect()
            try:
                authorized = bool(await client.is_user_authorized())
            finally:
                await client.disconnect()
            return HealthStatus(
                healthy=authorized, detail=None if authorized else "session not authorized"
            )
        except Exception as exc:  # noqa: BLE001
            return HealthStatus(healthy=False, detail=str(exc))
