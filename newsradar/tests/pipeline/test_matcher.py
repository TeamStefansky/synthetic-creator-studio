"""Watchlist matcher: keywords, phrases, boolean, exclusions, RTL languages."""

from __future__ import annotations

import pytest

from newsradar.connectors.base import QueryTerm
from newsradar.pipeline.matcher import compile_watchlist


def _match(terms: list[QueryTerm], text: str, lang: str | None = None):  # type: ignore[no-untyped-def]
    return compile_watchlist(terms).match(text, lang)


def test_keyword_match_english() -> None:
    result = _match([QueryTerm(text="cybersecurity")], "A cybersecurity firm raised funds.")
    assert result.matched is True
    assert result.matched_terms == ["cybersecurity"]
    assert result.score == pytest.approx(1.0)


def test_keyword_no_match() -> None:
    result = _match([QueryTerm(text="cybersecurity")], "A story about agriculture.")
    assert result.matched is False
    assert result.score == 0.0


def test_word_boundary_prevents_substring_match() -> None:
    # "cyber" must not match inside "cybernetics".
    result = _match([QueryTerm(text="cyber")], "A talk about cybernetics theory.")
    assert result.matched is False


def test_hebrew_phrase_match() -> None:
    result = _match(
        [QueryTerm(text="בינה מלאכותית", term_type="phrase", lang="he")],
        "הרצאה על בינה מלאכותית התקיימה היום.",
        lang="he",
    )
    assert result.matched is True
    assert "בינה מלאכותית" in result.matched_terms


def test_hebrew_word_boundary() -> None:
    # "סייבר" should not match inside "סייברנטיקה".
    result = _match([QueryTerm(text="סייבר", lang="he")], "עולם הסייברנטיקה מרתק.", lang="he")
    assert result.matched is False


def test_arabic_keyword_match() -> None:
    result = _match(
        [QueryTerm(text="الأمن", lang="ar")],
        "ناقش المؤتمر قضايا الأمن السيبراني في المنطقة.",
        lang="ar",
    )
    assert result.matched is True


def test_boolean_and_match() -> None:
    terms = [QueryTerm(text="Israel AND cyber", term_type="boolean")]
    assert _match(terms, "Israel launches a new cyber unit.").matched is True
    assert _match(terms, "Israel launches a new agriculture unit.").matched is False


def test_boolean_or_match() -> None:
    terms = [QueryTerm(text="cyber OR quantum", term_type="boolean")]
    assert _match(terms, "A quantum computing breakthrough.").matched is True


def test_boolean_complex_expression() -> None:
    # A AND (B OR C) NOT D
    terms = [QueryTerm(text='Israel AND (cyber OR "iron dome") NOT sports', term_type="boolean")]
    assert _match(terms, "Israel deployed the Iron Dome system.").matched is True
    assert _match(terms, "Israel unveiled a cyber initiative.").matched is True
    # D present -> NOT D fails the expression.
    assert _match(terms, "Israel cyber team wins sports hackathon.").matched is False
    # A missing.
    assert _match(terms, "France unveiled a cyber initiative.").matched is False


def test_boolean_quoted_phrase_leaf() -> None:
    terms = [QueryTerm(text='"iron dome"', term_type="boolean")]
    assert _match(terms, "The Iron Dome intercepted the rocket.").matched is True
    assert _match(terms, "The dome of the rock is iron-rich.").matched is False


def test_exclusion_term_vetoes_match() -> None:
    terms = [
        QueryTerm(text="cyber"),
        QueryTerm(text="sponsored", is_exclusion=True),
    ]
    assert _match(terms, "A cyber report.").matched is True
    assert _match(terms, "A cyber report. Sponsored content.").matched is False


def test_per_language_term_set_scoping() -> None:
    # A Hebrew-scoped term does not apply to an English document.
    terms = [QueryTerm(text="סייבר", lang="he")]
    assert _match(terms, "An english cyber story.", lang="en").matched is False
    assert _match(terms, "סיפור על סייבר.", lang="he").matched is True


def test_score_normalization_partial() -> None:
    terms = [
        QueryTerm(text="cyber", weight=1.0),
        QueryTerm(text="quantum", weight=3.0),
    ]
    result = _match(terms, "Only a cyber story here.")
    assert result.matched is True
    assert result.score == pytest.approx(1.0 / 4.0)


def test_matched_terms_deduplicated() -> None:
    result = _match([QueryTerm(text="cyber")], "cyber cyber cyber everywhere")
    assert result.matched_terms == ["cyber"]
