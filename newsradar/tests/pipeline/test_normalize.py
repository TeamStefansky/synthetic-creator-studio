"""Normalisation: canonical URLs, hashing, language, summaries, fulltext gate."""

from __future__ import annotations

import datetime as dt

import pytest

from newsradar.connectors.base import RawDocument
from newsradar.pipeline.normalize import (
    SUMMARY_MAX_CHARS,
    build_summary,
    canonical_url,
    detect_language,
    normalize_document,
    normalize_published_at,
    url_hash,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "https://www.Example.com/Article?utm_source=twitter&utm_medium=social&id=42",
            "https://www.example.com/Article?id=42",
        ),
        ("https://example.com/story/#section", "https://example.com/story"),
        ("https://amp.example.com/news/story", "https://example.com/news/story"),
        ("https://m.example.com/news/story/", "https://example.com/news/story"),
        ("https://example.com/news/story/amp", "https://example.com/news/story"),
        (
            "https://example.com/p?b=2&a=1&fbclid=xyz&gclid=abc",
            "https://example.com/p?a=1&b=2",
        ),
    ],
)
def test_canonical_url(raw: str, expected: str) -> None:
    assert canonical_url(raw) == expected


def test_canonical_url_is_stable_and_hashable() -> None:
    a = canonical_url("https://example.com/x?utm_campaign=z&k=1")
    b = canonical_url("https://example.com/x?k=1")
    assert a == b
    assert url_hash(a) == url_hash(b)
    assert len(url_hash(a)) == 64


def test_detect_language() -> None:
    assert detect_language("The prime minister addressed the nation today.") == "en"
    assert detect_language("ראש הממשלה נאם הערב בפני האומה בירושלים.") == "he"
    assert detect_language("ألقى رئيس الوزراء خطابا أمام الأمة مساء اليوم.") == "ar"
    assert detect_language("") is None
    assert detect_language(None) is None


def test_normalize_published_at_to_utc() -> None:
    naive = dt.datetime(2026, 7, 20, 12, 0)
    assert normalize_published_at(naive).tzinfo is dt.UTC  # type: ignore[union-attr]
    tz = dt.timezone(dt.timedelta(hours=3))
    aware = dt.datetime(2026, 7, 20, 15, 0, tzinfo=tz)
    assert normalize_published_at(aware) == dt.datetime(2026, 7, 20, 12, 0, tzinfo=dt.UTC)
    assert normalize_published_at(None) is None


def test_build_summary_caps_length() -> None:
    long_text = "word " * 300
    summary = build_summary("Title", long_text)
    assert summary is not None
    assert len(summary) <= SUMMARY_MAX_CHARS
    assert build_summary(None, None) is None


def test_normalize_document_respects_fulltext_gate() -> None:
    raw = RawDocument(
        source_domain="Example.com",
        url="https://example.com/a?utm_source=x",
        title="A cyber story",
        body_text="Full body text that is reasonably long and descriptive of the story content.",
        published_at=dt.datetime(2026, 7, 20, 12, 0, tzinfo=dt.UTC),
    )
    gated = normalize_document(raw, allows_fulltext_storage=False)
    assert gated.body is None
    assert gated.summary is not None
    assert gated.canonical_url == "https://example.com/a"
    assert gated.source_domain == "example.com"

    allowed = normalize_document(raw, allows_fulltext_storage=True)
    assert allowed.body is not None
