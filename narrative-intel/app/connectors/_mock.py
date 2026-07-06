"""Deterministic mock fixtures so the whole pipeline runs without any API keys.

Each generator returns raw items in the SAME shape the connector's real fetch()
produces, so normalize() is identical for mock and live data. Includes a couple
of bot-like authors so later stages (authenticity/coordination) have signal.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

_BASE = datetime(2026, 7, 1, 12, 0, 0, tzinfo=timezone.utc)


def _iso(mins: int) -> str:
    return (_BASE + timedelta(minutes=mins)).isoformat()


def x_items() -> list[dict]:
    authors = [
        {"id": "1001", "username": "real_reporter", "name": "Real Reporter", "created_at": "2015-03-01T00:00:00Z",
         "description": "Journalist", "verified": True, "public_metrics": {"followers_count": 42000, "following_count": 900, "tweet_count": 12000}},
        {"id": "2002", "username": "news_bot_88213", "name": "news", "created_at": "2026-06-20T00:00:00Z",
         "description": "", "verified": False, "public_metrics": {"followers_count": 12, "following_count": 900, "tweet_count": 8400}},
        {"id": "2003", "username": "patriot_99471", "name": "patriot", "created_at": "2026-06-22T00:00:00Z",
         "description": "", "verified": False, "public_metrics": {"followers_count": 8, "following_count": 1200, "tweet_count": 9100}},
    ]
    by_id = {a["id"]: a for a in authors}
    tweets = [
        {"id": "9001", "author_id": "1001", "created_at": _iso(0), "text": "Officials confirm the new policy takes effect Monday.",
         "public_metrics": {"like_count": 120, "retweet_count": 30, "reply_count": 12, "quote_count": 3}},
        {"id": "9002", "author_id": "2002", "created_at": _iso(1), "text": "BREAKING: they don't want you to know the TRUTH about the policy!!!",
         "public_metrics": {"like_count": 2, "retweet_count": 40, "reply_count": 0, "quote_count": 0}},
        {"id": "9003", "author_id": "2003", "created_at": _iso(2), "text": "BREAKING: they don't want you to know the TRUTH about the policy!!!",
         "public_metrics": {"like_count": 1, "retweet_count": 38, "reply_count": 0, "quote_count": 0}},
    ]
    return [{**t, "author": by_id[t["author_id"]]} for t in tweets]


def telegram_items() -> list[dict]:
    return [
        {"message_id": 501, "channel": "news_channel", "date": _iso(5),
         "text": "Forwarded: the policy will 'destroy' the economy, sources say.",
         "author": {"id": "tg_news_channel", "username": "news_channel", "title": "News Channel"}},
        {"message_id": 502, "channel": "alt_channel", "date": _iso(6),
         "text": "Forwarded: the policy will 'destroy' the economy, sources say.",
         "author": {"id": "tg_alt_channel", "username": "alt_channel", "title": "Alt Channel"}},
    ]


def rss_items() -> list[dict]:
    return [
        {"guid": "rss-1", "link": "https://example-news.test/policy", "published": _iso(10),
         "title": "New policy explained", "summary": "The government announced a new policy effective Monday.",
         "author": {"id": "example-news.test", "name": "Example News"}},
    ]


def newsapi_items() -> list[dict]:
    return [
        {"url": "https://newswire.test/policy-analysis", "publishedAt": _iso(12),
         "title": "Policy analysis", "description": "Analysts weigh the impact of the new policy.",
         "source": {"id": "newswire", "name": "Newswire"}},
    ]
