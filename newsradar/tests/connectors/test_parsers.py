"""Connector response parsers, exercised against recorded fixtures (no network)."""

from __future__ import annotations

import datetime as dt
import json
import types
from pathlib import Path

from newsradar.connectors.gdelt import build_gdelt_query, parse_gdelt_articles
from newsradar.connectors.perigon import parse_perigon_response
from newsradar.connectors.rss import parse_feed
from newsradar.connectors.telegram import message_to_raw
from newsradar.connectors.youtube import parse_youtube

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


# --- GDELT --------------------------------------------------------------------------


def test_gdelt_parse_from_fixture() -> None:
    payload = json.loads((FIXTURES / "gdelt_sample.json").read_text())
    docs = parse_gdelt_articles(payload)
    # The malformed record without a URL is skipped.
    assert len(docs) == 4
    by_domain = {d.source_domain: d for d in docs}
    assert by_domain["reuters.com"].title.startswith("Israeli cybersecurity")  # type: ignore[union-attr]
    assert by_domain["ynet.co.il"].lang == "he"
    assert by_domain["aljazeera.net"].lang == "ar"
    ru = by_domain["reuters.com"]
    assert ru.published_at == dt.datetime(2026, 7, 20, 10, 15, tzinfo=dt.UTC)


def test_build_gdelt_query_translates_boolean() -> None:
    from newsradar.connectors.base import QueryTerm, WatchlistQuery

    query = WatchlistQuery(
        watchlist_id="00000000-0000-0000-0000-000000000001",  # type: ignore[arg-type]
        name="demo",
        terms=[
            QueryTerm(text="Iron Dome"),
            QueryTerm(text="cyber"),
            QueryTerm(text="football", is_exclusion=True),
        ],
    )
    q = build_gdelt_query(query)
    assert '"Iron Dome"' in q
    assert "OR" in q
    assert "-football" in q


# --- RSS ----------------------------------------------------------------------------


def test_rss_parse_from_fixture() -> None:
    content = (FIXTURES / "rss_sample.xml").read_text()
    meta = {"source_domain": "timesofisrael.com", "country": "IL", "lang": "en", "tier": 2}
    docs = parse_feed(content, meta)
    assert len(docs) == 3
    first = docs[0]
    assert first.source_domain == "timesofisrael.com"
    assert first.title == "Israeli startup launches quantum-safe encryption platform"
    assert first.author == "Tech Desk"
    assert first.published_at == dt.datetime(2026, 7, 20, 9, 30, tzinfo=dt.UTC)
    # content:encoded is captured as HTML for later extraction.
    assert first.body_html is not None and "quantum" in first.body_html


# --- Perigon ------------------------------------------------------------------------


def test_perigon_parse_maps_rich_metadata() -> None:
    payload = json.loads((FIXTURES / "perigon_sample.json").read_text())
    docs = parse_perigon_response(payload)
    assert len(docs) == 2
    first = docs[0]
    assert first.source_domain == "jpost.com"
    assert first.author == "Jane Doe, John Smith"
    assert first.published_at == dt.datetime(2026, 7, 20, 8, 15, tzinfo=dt.UTC)
    # Native sentiment / entities / locations are preserved in raw for P2.
    assert first.raw["sentiment"]["positive"] == 0.62
    assert first.raw["entities"][0]["data"] == "Check Point"
    assert first.raw["locations"][0]["lat"] == 32.0853
    assert docs[1].lang == "he"


# --- YouTube ------------------------------------------------------------------------


def test_youtube_parse_combines_search_and_videos() -> None:
    search = json.loads((FIXTURES / "youtube_search.json").read_text())
    videos = json.loads((FIXTURES / "youtube_videos.json").read_text())
    docs = parse_youtube(search, videos)
    # The channel-only result (no videoId) is skipped.
    assert len(docs) == 2
    first = docs[0]
    assert first.url == "https://www.youtube.com/watch?v=vid_abc123"
    assert first.media_type == "video"
    assert first.engagement["views"] == "15234"
    assert first.author == "i24NEWS English"
    assert first.published_at == dt.datetime(2026, 7, 20, 10, 0, tzinfo=dt.UTC)


# --- Telegram -----------------------------------------------------------------------


def test_telegram_message_to_raw() -> None:
    message = types.SimpleNamespace(
        id=4567,
        message="Breaking: cyber incident reported at major firm\nMore details to follow.",
        date=dt.datetime(2026, 7, 20, 12, 0, tzinfo=dt.UTC),
        views=1200,
        forwards=45,
    )
    meta = {"username": "abualiexpress", "title": "Abu Ali Express", "country": "IL", "lang": "he"}
    doc = message_to_raw(message, meta)
    assert doc.url == "https://t.me/abualiexpress/4567"
    assert doc.source_domain == "t.me/abualiexpress"
    assert doc.title == "Breaking: cyber incident reported at major firm"
    assert doc.media_type == "post"
    assert doc.engagement["views"] == 1200
    assert doc.lang == "he"


def test_telegram_naive_date_is_made_utc() -> None:
    message = types.SimpleNamespace(id=1, message="hi", date=dt.datetime(2026, 7, 20, 12, 0))
    doc = message_to_raw(message, {"username": "x"})
    assert doc.published_at is not None and doc.published_at.tzinfo is dt.UTC
