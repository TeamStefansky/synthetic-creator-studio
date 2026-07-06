"""Authenticity Engine tests (Stage 2)."""
from sqlalchemy import select

from app.authenticity.engine import score_all, score_author
from app.authenticity.signals import AccountAgeVsVolume, FollowerRatio
from app.ingest.service import ingest_source
from app.models import Author, AuthorSignal


def _author(db, handle):
    return db.scalar(select(Author).where(Author.handle == handle))


def test_bot_scores_lower_than_real_account(db):
    ingest_source(db, "x")
    score_all(db)

    real = _author(db, "real_reporter")
    bot = _author(db, "news_bot_88213")
    assert real.authenticity_score is not None and bot.authenticity_score is not None
    # The verified, established journalist should score clearly more authentic.
    assert real.authenticity_score > 70
    assert bot.authenticity_score < 45
    assert real.authenticity_score > bot.authenticity_score


def test_signal_breakdown_is_stored(db):
    ingest_source(db, "x")
    score_all(db)
    bot = _author(db, "patriot_99471")
    signals = list(db.scalars(select(AuthorSignal).where(AuthorSignal.author_id == bot.id)))
    names = {s.name for s in signals}
    assert {"account_age_vs_volume", "follower_ratio", "profile_completeness"} <= names
    # Every signal carries an explanation for the "why suspicious" UI.
    assert all(s.explanation for s in signals)


def test_recompute_is_idempotent(db):
    ingest_source(db, "x")
    score_all(db)
    bot = _author(db, "patriot_99471")
    first = score_author(db, bot)
    count_after_first = len(list(db.scalars(select(AuthorSignal).where(AuthorSignal.author_id == bot.id))))
    second = score_author(db, bot)
    count_after_second = len(list(db.scalars(select(AuthorSignal).where(AuthorSignal.author_id == bot.id))))
    assert first == second
    assert count_after_first == count_after_second  # no duplicate signal rows


def test_follower_ratio_signal_unit():
    class A:
        followers = 10
        following = 1000
        created_at = None
        posts_count = None
        bio = None
        avatar_url = None
        raw = {}
    res = FollowerRatio().evaluate(A(), [])
    assert res.score == 100  # ratio 100 -> maxed out
    assert res.confidence > 0


def test_age_volume_signal_no_data_is_zero_confidence():
    class A:
        created_at = None
        posts_count = None
    res = AccountAgeVsVolume().evaluate(A(), [])
    assert res.confidence == 0.0
