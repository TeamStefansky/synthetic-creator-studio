"""Connector registry — maps a source name to its connector instance."""
from __future__ import annotations

from .base import SourceConnector
from .newsapi import NewsApiConnector
from .rss import RssConnector
from .telegram import TelegramConnector
from .x import XConnector

_BUILDERS = {
    "x": XConnector,
    "telegram": TelegramConnector,
    "rss": RssConnector,
    "newsapi": NewsApiConnector,
}


def get_connector(name: str) -> SourceConnector:
    try:
        return _BUILDERS[name]()
    except KeyError as exc:
        raise ValueError(f"Unknown source '{name}'") from exc


def available_sources() -> list[str]:
    return list(_BUILDERS.keys())
