"""Authenticity Engine: combine independent signals into a stored 0-100 score.

authenticity_score (higher = more authentic) = 100 - weighted inauthenticity,
where signals are weighted by weight * confidence so no-data signals don't skew
the result. The per-signal breakdown is persisted (AuthorSignal) so the UI can
explain *why* an account is suspicious.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Author, AuthorSignal, Post
from .signals import ALL_SIGNALS, SignalResult

_WEIGHTS_PATH = Path(__file__).with_name("weights.json")


def load_weights() -> dict[str, float]:
    data = json.loads(_WEIGHTS_PATH.read_text())
    return {k: float(v) for k, v in data.get("weights", {}).items()}


def score_author(db: Session, author: Author) -> float | None:
    """Compute + persist the authenticity score and its signal breakdown."""
    weights = load_weights()
    posts = list(db.scalars(select(Post).where(Post.author_id == author.id)))

    num = 0.0  # sum(score * weight * confidence)
    den = 0.0  # sum(weight * confidence)

    # Clear prior breakdown, recompute. Flush so the deletes land before the
    # re-inserts (the unique (author_id, name) constraint would otherwise clash).
    for old in list(author.signals):
        db.delete(old)
    db.flush()

    for signal in ALL_SIGNALS:
        w = weights.get(signal.name, 0.0)
        res: SignalResult = signal.evaluate(author, posts)
        db.add(AuthorSignal(
            author_id=author.id, name=signal.name, score=round(res.score, 2),
            confidence=round(res.confidence, 3), weight=w, explanation=res.explanation,
        ))
        num += res.score * w * res.confidence
        den += w * res.confidence

    if den == 0:
        author.authenticity_score = None
        db.commit()
        return None

    inauthenticity = num / den
    author.authenticity_score = round(100 - inauthenticity, 1)
    db.commit()
    return author.authenticity_score


def score_all(db: Session) -> dict:
    authors = list(db.scalars(select(Author)))
    scored = 0
    for a in authors:
        if score_author(db, a) is not None:
            scored += 1
    return {"authors": len(authors), "scored": scored}
