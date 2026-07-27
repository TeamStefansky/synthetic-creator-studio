"""Connector registry: which connectors exist and which are enabled.

A connector is enabled only when every ``Settings`` field named in its
``required_env`` is present (non-empty). Connectors with no requirements (GDELT,
RSS) are always enabled.
"""

from __future__ import annotations

from newsradar.config import Settings, get_settings
from newsradar.connectors.base import BaseConnector
from newsradar.connectors.gdelt import GdeltConnector
from newsradar.connectors.perigon import PerigonConnector
from newsradar.connectors.rss import RssConnector
from newsradar.connectors.telegram import TelegramConnector
from newsradar.connectors.youtube import YouTubeConnector

# Ordered by ingestion priority / cadence.
CONNECTOR_CLASSES: tuple[type[BaseConnector], ...] = (
    GdeltConnector,
    RssConnector,
    TelegramConnector,
    YouTubeConnector,
    PerigonConnector,
)


def _requirements_met(cls: type[BaseConnector], settings: Settings) -> bool:
    for field in cls.required_env:
        value = getattr(settings, field, "")
        if value is None or (isinstance(value, str) and not value.strip()):
            return False
    return not (cls is PerigonConnector and not settings.perigon_enabled)


def is_enabled(cls: type[BaseConnector], settings: Settings | None = None) -> bool:
    """Whether a connector class is enabled under the given settings."""

    return _requirements_met(cls, settings or get_settings())


def build_connector(cls: type[BaseConnector], settings: Settings) -> BaseConnector:
    """Instantiate a connector, passing ``settings`` where the constructor accepts it."""

    try:
        return cls(settings=settings)  # type: ignore[call-arg]
    except TypeError:
        return cls()


def get_enabled_connectors(settings: Settings | None = None) -> list[BaseConnector]:
    """Return an instance of every enabled connector."""

    settings = settings or get_settings()
    return [
        build_connector(cls, settings)
        for cls in CONNECTOR_CLASSES
        if _requirements_met(cls, settings)
    ]


def get_connector_by_name(name: str, settings: Settings | None = None) -> BaseConnector | None:
    """Return an instance of the named connector (enabled or not), or ``None``."""

    settings = settings or get_settings()
    for cls in CONNECTOR_CLASSES:
        if cls.name == name:
            return build_connector(cls, settings)
    return None
