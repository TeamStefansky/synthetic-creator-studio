"""Feed discovery against recorded fixtures for 8 real-shaped sites.

Covers: head ``<link rel=alternate>``, multiple head feeds, well-known paths
(RSS and Atom), the ``www``/apex fallback, the ``<a>``-only case, the no-feed
case, the per-site request budget, and the never-leave-the-host rule.
"""

from __future__ import annotations

import pytest

from newsradar.feeds.discovery import (
    MAX_REQUESTS_PER_SITE,
    discover_feeds,
    normalize_site_url,
)
from newsradar.feeds.http import is_safe_url
from tests.feeds._recorded import recorded


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("theverge.com", "https://theverge.com/"),
        ("http://Example.com/some/path?x=1", "http://example.com/"),
        ("https://www.bbc.co.uk/news/", "https://www.bbc.co.uk/"),
        ("bbc.co.uk/#frag", "https://bbc.co.uk/"),
    ],
)
def test_normalize_site_url(raw: str, expected: str) -> None:
    assert normalize_site_url(raw) == expected


@pytest.mark.asyncio
async def test_head_link_alternate() -> None:
    fetcher = recorded(
        {
            "https://theverge.com/": "theverge_home.html",
            "https://theverge.com/rss/index.xml": "rss_generic.xml",
        }
    )
    feeds = await discover_feeds("theverge.com", fetcher=fetcher)
    assert len(feeds) == 1
    assert feeds[0].feed_url == "https://theverge.com/rss/index.xml"
    assert feeds[0].item_count == 3
    assert feeds[0].detected_lang == "en"
    assert feeds[0].site_title == "The Verge"
    assert feeds[0].last_published_at is not None


@pytest.mark.asyncio
async def test_head_link_absolute_href() -> None:
    fetcher = recorded(
        {
            "https://arstechnica.com/": "arstechnica_home.html",
            "https://arstechnica.com/feed/": "rss_generic.xml",
        }
    )
    feeds = await discover_feeds("https://arstechnica.com/", fetcher=fetcher)
    assert [f.feed_url for f in feeds] == ["https://arstechnica.com/feed/"]


@pytest.mark.asyncio
async def test_multiple_head_feeds() -> None:
    fetcher = recorded(
        {
            "https://multifeed.news/": "multifeed_home.html",
            "https://multifeed.news/rss/top.xml": "rss_generic.xml",
            "https://multifeed.news/atom/world.xml": "atom_generic.xml",
        }
    )
    feeds = await discover_feeds("multifeed.news", fetcher=fetcher)
    urls = {f.feed_url for f in feeds}
    assert urls == {
        "https://multifeed.news/rss/top.xml",
        "https://multifeed.news/atom/world.xml",
    }


@pytest.mark.asyncio
async def test_well_known_rss_path() -> None:
    fetcher = recorded(
        {
            "https://techcrunch.com/": "techcrunch_home.html",
            "https://techcrunch.com/feed": "techcrunch_rss.xml",
        }
    )
    feeds = await discover_feeds("techcrunch.com", fetcher=fetcher)
    assert [f.feed_url for f in feeds] == ["https://techcrunch.com/feed"]
    assert feeds[0].site_title == "TechCrunch"
    assert fetcher.requests.count("https://techcrunch.com/") == 1


@pytest.mark.asyncio
async def test_well_known_atom_path() -> None:
    fetcher = recorded(
        {
            "https://atomblog.org/": "atomblog_home.html",
            "https://atomblog.org/atom.xml": "atom_generic.xml",
        }
    )
    feeds = await discover_feeds("atomblog.org", fetcher=fetcher)
    assert [f.feed_url for f in feeds] == ["https://atomblog.org/atom.xml"]


@pytest.mark.asyncio
async def test_www_apex_fallback() -> None:
    # The pasted apex homepage 404s; discovery falls back to the www host.
    fetcher = recorded(
        {
            "https://www.bbc.co.uk/": "bbc_www_home.html",
            "https://www.bbc.co.uk/news/rss.xml": "bbc_rss.xml",
        }
    )
    feeds = await discover_feeds("bbc.co.uk", fetcher=fetcher)
    assert [f.feed_url for f in feeds] == ["https://www.bbc.co.uk/news/rss.xml"]
    assert "https://bbc.co.uk/" in fetcher.requests  # apex was tried first


@pytest.mark.asyncio
async def test_anchor_only_feed() -> None:
    fetcher = recorded(
        {
            "https://linkonly.blog/": "linkonly_home.html",
            "https://linkonly.blog/blog/feed": "linkonly_feed.xml",
        }
    )
    feeds = await discover_feeds("linkonly.blog", fetcher=fetcher)
    assert [f.feed_url for f in feeds] == ["https://linkonly.blog/blog/feed"]
    assert fetcher.requests[-1] == "https://linkonly.blog/blog/feed"


@pytest.mark.asyncio
async def test_no_feed_site() -> None:
    fetcher = recorded({"https://acme-widgets.example/": "nofeed_home.html"})
    feeds = await discover_feeds("acme-widgets.example", fetcher=fetcher)
    assert feeds == []
    # No crawl beyond the pasted host, within budget.
    assert len(fetcher.requests) <= MAX_REQUESTS_PER_SITE
    assert all("acme-widgets.example" in u for u in fetcher.requests)


@pytest.mark.asyncio
async def test_request_budget_is_respected() -> None:
    fetcher = recorded({"https://acme-widgets.example/": "nofeed_home.html"})
    await discover_feeds("acme-widgets.example", fetcher=fetcher, max_requests=4)
    assert len(fetcher.requests) <= 4


def test_ssrf_guard_blocks_private_hosts() -> None:
    assert is_safe_url("https://example.com/feed") is True
    assert is_safe_url("http://localhost/feed") is False
    assert is_safe_url("http://127.0.0.1/feed") is False
    assert is_safe_url("http://169.254.169.254/latest/meta-data") is False
    assert is_safe_url("http://10.0.0.5/internal") is False
    assert is_safe_url("ftp://example.com/x") is False
    assert is_safe_url("file:///etc/passwd") is False
