"""Source-country vs subject-country semantics gate (P5).

A Reuters (GB) article *about* Brazil must match ``source_countries=['GB']`` in
``source`` mode, match ``subject_countries=['BR']`` in ``subject`` mode, and
match in ``either`` mode — and never the wrong one.

    source_country  = sources.country_code            (where the outlet is based)
    subject_country = document_enrichment.geo.country_code  (what the story is about)
"""

from __future__ import annotations

from newsradar.pipeline.matcher import country_allows

# Reuters is based in GB; the story is about Brazil.
SRC = "GB"
SUBJ = "BR"


def test_source_mode() -> None:
    assert country_allows(
        "source",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=["GB"],
        subject_filter=None,
    )
    # The wrong one: source is GB, not BR.
    assert not country_allows(
        "source",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=["BR"],
        subject_filter=None,
    )


def test_subject_mode() -> None:
    assert country_allows(
        "subject",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=None,
        subject_filter=["BR"],
    )
    # The wrong one: subject is BR, not GB.
    assert not country_allows(
        "subject",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=None,
        subject_filter=["GB"],
    )


def test_either_mode() -> None:
    # Matches on the source side.
    assert country_allows(
        "either",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=["GB"],
        subject_filter=None,
    )
    # Matches on the subject side.
    assert country_allows(
        "either",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=None,
        subject_filter=["BR"],
    )
    # Matches when both correct filters are supplied.
    assert country_allows(
        "either",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=["GB"],
        subject_filter=["BR"],
    )
    # Both wrong -> no match.
    assert not country_allows(
        "either",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=["US"],
        subject_filter=["FR"],
    )


def test_missing_country_does_not_falsely_match() -> None:
    # A set filter with no known country on the document does not pass.
    assert not country_allows(
        "source",
        source_country=None,
        subject_country=SUBJ,
        source_filter=["GB"],
        subject_filter=None,
    )
    assert not country_allows(
        "subject",
        source_country=SRC,
        subject_country=None,
        source_filter=None,
        subject_filter=["BR"],
    )


def test_none_filters_are_unconstrained() -> None:
    assert country_allows(
        "either",
        source_country=SRC,
        subject_country=SUBJ,
        source_filter=None,
        subject_filter=None,
    )
