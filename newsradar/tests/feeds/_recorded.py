"""Helpers to build a :class:`RecordedFetcher` from on-disk fixture files.

The whole P5 outbound layer is tested against recorded fixtures (never the live
network, which is blocked in this environment). ``recorded(mapping)`` maps an
absolute URL to a fixture filename under ``tests/fixtures/feeds/``; every other
URL yields a synthetic 404.
"""

from __future__ import annotations

from pathlib import Path

from newsradar.feeds.http import FetchResult, RecordedFetcher

FEEDS_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "feeds"


def _read(name: str) -> str:
    return (FEEDS_DIR / name).read_text(encoding="utf-8")


def response(
    url: str, fixture: str, *, status: int = 200, headers: dict[str, str] | None = None
) -> FetchResult:
    text = _read(fixture)
    return FetchResult(
        url=url,
        status_code=status,
        headers=headers or {"content-type": "text/html; charset=utf-8"},
        text=text,
        content=text.encode("utf-8"),
    )


def recorded(mapping: dict[str, str], robots: dict[str, bool] | None = None) -> RecordedFetcher:
    """Build a fetcher from ``{url: fixture_filename}``."""

    responses = {url: response(url, fixture) for url, fixture in mapping.items()}
    return RecordedFetcher(responses=responses, robots=robots or {})
