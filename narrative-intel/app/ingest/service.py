"""Ingest pipeline: fetch → normalize → dedup → upsert authors+posts.

Every source runs through the identical flow. Per-item normalization failures go
to the dead-letter table (forensics + retry) without failing the whole run. Each
run is recorded in ingest_runs for observability.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..connectors import get_connector
from ..models import Author, DeadLetter, IngestRun, Post
from ..schemas import IngestResult, NormalizedAuthor, NormalizedPost
from .dedup import content_hash


def _upsert_author(db: Session, na: NormalizedAuthor | None) -> Author | None:
    if na is None:
        return None
    existing = db.scalar(
        select(Author).where(Author.source == na.source, Author.source_author_id == na.source_author_id)
    )
    if existing:
        # Refresh volatile fields (followers/counts) if present.
        for field in ("handle", "display_name", "followers", "following", "posts_count", "bio", "avatar_url", "created_at"):
            val = getattr(na, field)
            if val is not None:
                setattr(existing, field, val)
        return existing
    author = Author(
        source=na.source,
        source_author_id=na.source_author_id,
        handle=na.handle,
        display_name=na.display_name,
        created_at=na.created_at,
        followers=na.followers,
        following=na.following,
        posts_count=na.posts_count,
        bio=na.bio,
        avatar_url=na.avatar_url,
        raw=na.raw,
    )
    db.add(author)
    db.flush()  # assign id
    return author


def ingest_source(db: Session, source: str, query: str | None = None,
                  entity: str | None = None) -> IngestResult:
    run = IngestRun(source=source, status="running")
    db.add(run)
    db.flush()

    fetched = inserted = duplicates = errors = 0
    seen: set[str] = set()  # hashes added in THIS run (not yet flushed)
    connector = get_connector(source)

    try:
        raw_items = connector.fetch(query)
    except Exception as exc:  # network / auth failure — record and bail cleanly
        run.status = "failed"
        run.detail = f"fetch failed: {exc}"[:500]
        run.finished_at = datetime.now(timezone.utc)
        db.add(DeadLetter(source=source, reason=f"fetch: {exc}"[:500], payload=None))
        db.commit()
        return IngestResult(source=source, fetched=0, inserted=0, duplicates=0, errors=1, status="failed", detail=run.detail)

    for raw in raw_items:
        fetched += 1
        try:
            np: NormalizedPost = connector.normalize(raw)
        except Exception as exc:
            errors += 1
            db.add(DeadLetter(source=source, reason=f"normalize: {exc}"[:500], payload=_safe(raw)))
            continue

        # Idempotency key = (source, source_post_id). content_hash is stored too,
        # but is NOT a dedup key (identical text from different authors is signal).
        key = f"{np.source}\x00{np.source_post_id}"
        if key in seen or db.scalar(
            select(Post.id).where(Post.source == np.source, Post.source_post_id == np.source_post_id)
        ):
            duplicates += 1
            continue
        seen.add(key)
        chash = content_hash(np.source, np.text)

        author = _upsert_author(db, np.author)
        db.add(Post(
            source=np.source,
            source_post_id=np.source_post_id,
            content_hash=chash,
            entity=entity,
            author_id=author.id if author else None,
            text=np.text,
            lang=np.lang,
            url=np.url,
            media=np.media or None,
            engagement=np.engagement or None,
            timestamp=np.timestamp,
            raw=np.raw,
        ))
        inserted += 1

    run.fetched, run.inserted, run.duplicates, run.errors = fetched, inserted, duplicates, errors
    run.status = "ok"
    run.finished_at = datetime.now(timezone.utc)
    db.commit()
    return IngestResult(source=source, fetched=fetched, inserted=inserted, duplicates=duplicates, errors=errors, status="ok")


def _safe(raw: dict) -> dict | None:
    try:
        import json
        json.dumps(raw)
        return raw
    except Exception:
        return {"repr": str(raw)[:500]}
