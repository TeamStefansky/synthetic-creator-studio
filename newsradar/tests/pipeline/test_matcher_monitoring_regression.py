"""GATED regression: monitoring (kind='monitoring') matching is byte-for-byte unchanged.

The hybrid keyword+semantic matcher added in P5 applies to ``kind='interest'``
ONLY. This test pins the monitoring matcher's output over a deterministic
200-document corpus against a committed golden file, so any drift in the
monitoring path (the analyst regression suite's backbone) fails loudly.
"""

from __future__ import annotations

import json
from pathlib import Path

from newsradar.pipeline.matcher import compile_watchlist
from tests.pipeline._monitoring_corpus import (
    MONITORING_TERMS,
    build_corpus,
    match_text,
)

GOLDEN = Path(__file__).resolve().parent.parent / "fixtures" / "monitoring_matches_golden.json"


def test_monitoring_matching_is_byte_for_byte_unchanged() -> None:
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    docs = build_corpus(200)
    assert len(docs) == len(golden) == 200

    compiled = compile_watchlist(MONITORING_TERMS)
    for doc, expected in zip(docs, golden, strict=True):
        result = compiled.match(match_text(doc), doc["lang"])
        assert result.matched is expected["matched"]
        assert result.matched_terms == expected["matched_terms"]
        assert round(result.score, 6) == expected["score"]


def test_semantic_sentinel_never_appears_in_monitoring_output() -> None:
    # The interest-only sentinel must never leak into monitoring match terms.
    compiled = compile_watchlist(MONITORING_TERMS)
    for doc in build_corpus(200):
        result = compiled.match(match_text(doc), doc["lang"])
        assert "__semantic__" not in result.matched_terms
