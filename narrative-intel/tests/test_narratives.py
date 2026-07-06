"""Narratives, sentiment, and Manipulation Index tests (Stage 4)."""
from sqlalchemy import select

from app.ai import get_provider
from app.authenticity.engine import score_all
from app.ingest.service import ingest_source
from app.models import Narrative, Post
from app.narratives.engine import run


def test_sentiment_and_language(db):
    p = get_provider()
    assert p.sentiment("this is a great success") > 0
    assert p.sentiment("a terrible hoax and a scam") < 0
    assert p.language("שלום עולם") == "he"
    assert p.language("hello world") == "en"


def test_clusters_form_and_posts_labelled(db):
    ingest_source(db, "x")
    res = run(db)
    assert res["narratives"] >= 1
    # every post is assigned to a narrative
    unassigned = db.scalar(select(Post).where(Post.narrative_id.is_(None)))
    assert unassigned is None
    n = db.scalar(select(Narrative))
    assert n.keywords and n.label


def test_manipulation_index_high_when_bots_drive_it(db):
    ingest_source(db, "x")
    score_all(db)          # the two coordinated accounts are bots
    run(db)
    # The narrative carrying the duplicated bot text should be heavily bot-driven.
    narratives = list(db.scalars(select(Narrative)))
    top = max(narratives, key=lambda x: x.manipulation_index or 0)
    assert top.manipulation_index >= 50


def test_run_is_idempotent(db):
    ingest_source(db, "x")
    run(db)
    first = len(list(db.scalars(select(Narrative))))
    run(db)
    second = len(list(db.scalars(select(Narrative))))
    assert first == second
