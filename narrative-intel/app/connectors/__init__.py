"""Connector registry — maps a source name to its connector instance."""
from __future__ import annotations

from .base import SourceConnector
from .bluesky import BlueskyConnector
from .gdelt import GdeltConnector
from .hackernews import HackerNewsConnector
from .newsapi import NewsApiConnector
from .reddit import RedditConnector
from .rss import RssConnector
from .telegram import TelegramConnector
from .x import XConnector

_BUILDERS = {
    "x": XConnector,
    "telegram": TelegramConnector,
    "rss": RssConnector,
    "newsapi": NewsApiConnector,
    "gdelt": GdeltConnector,
    "bluesky": BlueskyConnector,
    "hackernews": HackerNewsConnector,
    "reddit": RedditConnector,
}


def get_connector(name: str) -> SourceConnector:
    try:
        return _BUILDERS[name]()
    except KeyError as exc:
        raise ValueError(f"Unknown source '{name}'") from exc


def available_sources() -> list[str]:
    return list(_BUILDERS.keys())
