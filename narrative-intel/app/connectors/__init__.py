"""Connector registry — maps a source name to its connector instance."""
from __future__ import annotations

from .base import SourceConnector
from .bluesky import BlueskyConnector
from .brave import BraveConnector
from .gdelt import GdeltConnector
from .gnews import GNewsConnector
from .guardian import GuardianConnector
from .hackernews import HackerNewsConnector
from .mastodon import MastodonConnector
from .mediastack import MediastackConnector
from .newsapi import NewsApiConnector
from .newsdata import NewsDataConnector
from .nyt import NytConnector
from .reddit import RedditConnector
from .rss import RssConnector
from .telegram import TelegramConnector
from .x import XConnector
from .youtube import YouTubeConnector

_BUILDERS = {
    "x": XConnector,
    "telegram": TelegramConnector,
    "rss": RssConnector,
    "newsapi": NewsApiConnector,
    "gdelt": GdeltConnector,
    "bluesky": BlueskyConnector,
    "hackernews": HackerNewsConnector,
    "reddit": RedditConnector,
    "mastodon": MastodonConnector,
    "guardian": GuardianConnector,
    "nyt": NytConnector,
    "gnews": GNewsConnector,
    "newsdata": NewsDataConnector,
    "mediastack": MediastackConnector,
    "brave": BraveConnector,
    "youtube": YouTubeConnector,
}


def get_connector(name: str) -> SourceConnector:
    try:
        return _BUILDERS[name]()
    except KeyError as exc:
        raise ValueError(f"Unknown source '{name}'") from exc


def available_sources() -> list[str]:
    return list(_BUILDERS.keys())
