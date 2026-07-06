"""End-to-end ingestion test on mock data (the Stage 1 DoD)."""
from sqlalchemy import func, select

from app.ingest.service import ingest_source
from app.models import Author, Post


def test_ingest_x_end_to_end(db):
    res = ingest_source(db, "x")
    assert res.status == "ok"
    assert res.fetched == 3
    # All 3 are distinct source items -> all stored. Identical TEXT from two
    # different accounts is kept on purpose (coordinated-behavior signal).
    assert res.inserted == 3
    assert res.duplicates == 0
    assert db.scalar(select(func.count()).select_from(Post)) == 3
    assert db.scalar(select(func.count()).select_from(Author)) == 3


def test_identical_text_from_two_accounts_shares_content_hash(db):
    """The coordination signal is preserved: two posts, same content_hash."""
    ingest_source(db, "x")
    hashes = [h for (h,) in db.execute(select(Post.content_hash)).all()]
    # 3 posts, but only 2 distinct texts -> a duplicated content_hash exists.
    assert len(hashes) == 3
    assert len(set(hashes)) == 2


def test_ingest_is_idempotent(db):
    first = ingest_source(db, "x")
    second = ingest_source(db, "x")
    assert first.inserted == 3
    # Re-running the same source stores nothing new.
    assert second.inserted == 0
    assert second.duplicates == 3
    assert db.scalar(select(func.count()).select_from(Post)) == 3


def test_ingest_all_sources(db):
    for source in ("x", "telegram", "rss", "newsapi"):
        res = ingest_source(db, source)
        assert res.status == "ok"
        assert res.inserted >= 1
