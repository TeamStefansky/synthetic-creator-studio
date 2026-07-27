"""RSS/Atom feed discovery from an ordinary news-site URL.

The user pastes ordinary site URLs, not feed URLs — discovery is the system's
job and must cope with messy input (missing scheme, trailing paths, ``www``
variants, duplicates). The strategy, in order, is:

1. ``<link rel="alternate">`` feeds declared in ``<head>``;
2. well-known feed paths (``/feed``, ``/rss.xml``, ...);
3. any same-host ``<a>`` whose href matches ``/(rss|feed|atom)/i``.

Every candidate is validated by actually parsing it and requiring at least one
item. Discovery never leaves the pasted host (registrable domain) and issues at
most :data:`MAX_REQUESTS_PER_SITE` HTTP requests.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import feedparser
from selectolax.parser import HTMLParser

from newsradar.feeds.http import Fetcher
from newsradar.feeds.tld import registrable_domain
from newsradar.logging import get_logger
from newsradar.pipeline.normalize import detect_language

log = get_logger(__name__)

MAX_REQUESTS_PER_SITE = 10

WELL_KNOWN_PATHS = (
    "/feed",
    "/rss",
    "/rss.xml",
    "/feed.xml",
    "/atom.xml",
    "/index.xml",
    "/feeds/posts/default",
    "/?feed=rss2",
)

_FEED_MIME_TYPES = (
    "application/rss+xml",
    "application/atom+xml",
    "application/feed+json",
    "application/json",
    "text/xml",
    "application/xml",
)

_HREF_FEED_RE = re.compile(r"(rss|feed|atom)", re.IGNORECASE)

# GDELT-style language names occasionally appear in feed <language> tags.
_LANG_PREFIX_RE = re.compile(r"^([a-zA-Z]{2})")


@dataclass(slots=True)
class DiscoveredFeed:
    """A validated feed discovered for a site."""

    feed_url: str
    title: str | None
    site_title: str | None
    item_count: int
    last_published_at: dt.datetime | None
    detected_lang: str | None
    detected_country: str | None


class _Budget:
    """Tracks the per-site HTTP request budget."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.used = 0

    def take(self) -> bool:
        if self.used >= self.limit:
            return False
        self.used += 1
        return True


def normalize_site_url(raw: str) -> str:
    """Normalise pasted input to a root ``scheme://host/`` URL.

    Adds ``https://`` when the scheme is missing, lowercases the host, and drops
    any path, query and fragment (discovery starts from the homepage).
    """

    text = raw.strip()
    if not text:
        raise ValueError("empty URL")
    if "://" not in text:
        text = "https://" + text
    parts = urlsplit(text)
    host = (parts.hostname or "").lower()
    if not host:
        raise ValueError(f"no host in URL: {raw!r}")
    netloc = host if not parts.port else f"{host}:{parts.port}"
    scheme = parts.scheme.lower() or "https"
    return f"{scheme}://{netloc}/"


def _host_variants(root_url: str) -> list[str]:
    """Return the pasted host plus its ``www``/apex counterpart (deduplicated)."""

    parts = urlsplit(root_url)
    host = parts.hostname or ""
    scheme = parts.scheme or "https"
    variants = [host]
    if host.startswith("www."):
        variants.append(host[4:])
    else:
        variants.append("www." + host)
    seen: set[str] = set()
    out: list[str] = []
    for h in variants:
        if h and h not in seen:
            seen.add(h)
            out.append(f"{scheme}://{h}/")
    return out


def _same_registrable_domain(a: str, b: str) -> bool:
    return registrable_domain(a) == registrable_domain(b)


def _extract_head_feed_links(html: str, base_url: str) -> list[str]:
    """Collect ``<link rel="alternate">`` feed hrefs from a page's ``<head>``."""

    tree = HTMLParser(html)
    out: list[str] = []
    for node in tree.css("link"):
        attrs = node.attributes
        rel = (attrs.get("rel") or "").lower()
        mime = (attrs.get("type") or "").lower()
        href = attrs.get("href")
        if not href:
            continue
        if "alternate" in rel and any(mime == t for t in _FEED_MIME_TYPES):
            out.append(urljoin(base_url, href))
    return out


def _extract_anchor_feed_links(html: str, base_url: str) -> list[str]:
    """Collect same-host ``<a>`` hrefs that look like feeds (``rss``/``feed``/``atom``)."""

    tree = HTMLParser(html)
    out: list[str] = []
    for node in tree.css("a"):
        href = node.attributes.get("href")
        if not href:
            continue
        absolute = urljoin(base_url, href)
        if not absolute.startswith(("http://", "https://")):
            continue
        if not _same_registrable_domain(absolute, base_url):
            continue
        if _HREF_FEED_RE.search(urlsplit(absolute).path) or _HREF_FEED_RE.search(
            urlsplit(absolute).query
        ):
            out.append(absolute)
    return out


def _map_lang(raw: str | None) -> str | None:
    if not raw:
        return None
    m = _LANG_PREFIX_RE.match(raw.strip())
    return m.group(1).lower() if m else None


def _validate_feed(content: str, feed_url: str) -> DiscoveredFeed | None:
    """Parse ``content`` as a feed; return a :class:`DiscoveredFeed` if it has >=1 item."""

    parsed = feedparser.parse(content)
    entries = parsed.entries or []
    if not entries:
        return None

    feed_meta = getattr(parsed, "feed", {}) or {}
    site_title = feed_meta.get("title") or None

    last_published: dt.datetime | None = None
    for entry in entries:
        struct = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
        if struct is None:
            continue
        try:
            when = dt.datetime(
                struct[0], struct[1], struct[2], struct[3], struct[4], struct[5], tzinfo=dt.UTC
            )
        except (TypeError, ValueError):
            continue
        if last_published is None or when > last_published:
            last_published = when

    lang = _map_lang(feed_meta.get("language"))
    if lang is None:
        titles = " ".join(str(getattr(e, "title", "")) for e in entries[:5])
        lang = detect_language(titles) if titles.strip() else None

    return DiscoveredFeed(
        feed_url=feed_url,
        title=site_title,
        site_title=site_title,
        item_count=len(entries),
        last_published_at=last_published,
        detected_lang=lang,
        detected_country=None,  # never inferred from a feed
    )


async def _fetch_text(fetcher: Fetcher, url: str, budget: _Budget) -> str | None:
    if not budget.take():
        return None
    try:
        res = await fetcher.get(url)
    except Exception as exc:  # noqa: BLE001 - a bad candidate must not abort discovery
        log.debug("feeds.discovery.fetch_failed", url=url, error=str(exc))
        return None
    if not res.ok or not res.text.strip():
        return None
    return res.text


async def discover_feeds(
    url: str,
    *,
    fetcher: Fetcher,
    max_requests: int = MAX_REQUESTS_PER_SITE,
) -> list[DiscoveredFeed]:
    """Discover validated feeds for a pasted site ``url``.

    Never crawls beyond the given host and issues at most ``max_requests`` HTTP
    requests. Returns an empty list when the site exposes no discoverable feed.
    """

    root = normalize_site_url(url)
    budget = _Budget(max_requests)

    # Fetch the homepage, trying the pasted host then its www/apex counterpart.
    home_html: str | None = None
    home_url = root
    for candidate_root in _host_variants(root):
        html = await _fetch_text(fetcher, candidate_root, budget)
        if html is not None:
            home_html, home_url = html, candidate_root
            break
        if budget.used >= budget.limit:
            break

    candidates: list[str] = []
    if home_html is not None:
        candidates.extend(_extract_head_feed_links(home_html, home_url))

    # Well-known paths, only if the head declared nothing.
    if not candidates:
        candidates.extend(urljoin(home_url, path) for path in WELL_KNOWN_PATHS)

    # Same-host anchors, as a last resort.
    anchor_candidates: list[str] = []
    if home_html is not None:
        anchor_candidates = _extract_anchor_feed_links(home_html, home_url)

    seen: set[str] = set()
    discovered: list[DiscoveredFeed] = []

    for candidate in [*candidates, *anchor_candidates]:
        if candidate in seen:
            continue
        seen.add(candidate)
        if budget.used >= budget.limit:
            break
        if not _same_registrable_domain(candidate, home_url):
            continue
        content = await _fetch_text(fetcher, candidate, budget)
        if content is None:
            continue
        feed = _validate_feed(content, candidate)
        if feed is not None:
            discovered.append(feed)

    return discovered
