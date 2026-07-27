"""personal_score: determinism, component monotonicity, bounds."""

from __future__ import annotations

import datetime as dt

from newsradar.site.ranking import StoryFeatures, personal_score

NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)


def _features(**kw: object) -> StoryFeatures:
    base: dict[str, object] = {
        "interest_affinity_raw": 1.5,
        "source_count": 3,
        "source_tier": 2,
        "credibility_score": 0.7,
        "heat_score": 40.0,
        "published_at": NOW - dt.timedelta(hours=2),
    }
    base.update(kw)
    return StoryFeatures(**base)  # type: ignore[arg-type]


def test_score_is_deterministic() -> None:
    f = _features()
    assert personal_score(f, now=NOW, halflife_hours=8.0) == personal_score(
        f, now=NOW, halflife_hours=8.0
    )


def test_score_bounds() -> None:
    lo = personal_score(
        StoryFeatures(0.0, 1, 4, 0.0, 0.0, NOW - dt.timedelta(days=30)),
        now=NOW,
        halflife_hours=8.0,
    )
    hi = personal_score(
        StoryFeatures(2.0, 50, 1, 1.0, 100.0, NOW),
        now=NOW,
        halflife_hours=8.0,
    )
    assert 0.0 <= lo < hi <= 100.0


def test_recency_decays_monotonically() -> None:
    fresh = personal_score(_features(published_at=NOW), now=NOW, halflife_hours=8.0)
    old = personal_score(
        _features(published_at=NOW - dt.timedelta(hours=48)), now=NOW, halflife_hours=8.0
    )
    assert fresh > old


def test_corroboration_and_trust_increase_score() -> None:
    base = _features(source_count=2, source_tier=3)
    more_sources = _features(source_count=8, source_tier=3)
    higher_tier = _features(source_count=2, source_tier=1)
    assert personal_score(more_sources, now=NOW, halflife_hours=8.0) > personal_score(
        base, now=NOW, halflife_hours=8.0
    )
    assert personal_score(higher_tier, now=NOW, halflife_hours=8.0) > personal_score(
        base, now=NOW, halflife_hours=8.0
    )


def test_keyword_affinity_outranks_semantic() -> None:
    keyword = _features(interest_affinity_raw=1.8)  # 1.0 + keyword score
    semantic = _features(interest_affinity_raw=0.8)  # cosine similarity only
    assert personal_score(keyword, now=NOW, halflife_hours=8.0) > personal_score(
        semantic, now=NOW, halflife_hours=8.0
    )
