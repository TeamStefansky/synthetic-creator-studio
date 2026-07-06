"""REST API for the ingestion layer (Stage 1). Expands in later stages."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..authenticity.engine import score_all, score_author
from ..connectors import available_sources, get_connector
from ..db import get_session
from ..ingest.service import ingest_source
from ..models import Author, IngestRun, Post
from ..schemas import AuthorDetailOut, AuthorOut, IngestResult, PostOut

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_session)) -> dict:
    connectors = []
    for name in available_sources():
        try:
            connectors.append(get_connector(name).health())
        except Exception as exc:  # pragma: no cover
            connectors.append({"source": name, "ok": False, "error": str(exc)})
    return {
        "ok": True,
        "posts": db.scalar(select(func.count()).select_from(Post)) or 0,
        "authors": db.scalar(select(func.count()).select_from(Author)) or 0,
        "connectors": connectors,
    }


@router.get("/sources")
def sources() -> dict:
    return {"sources": available_sources()}


@router.post("/ingest/run", response_model=list[IngestResult])
def run_ingest(
    source: str | None = Query(default=None, description="one source, or all when omitted"),
    db: Session = Depends(get_session),
) -> list[IngestResult]:
    targets = [source] if source else available_sources()
    results = []
    for name in targets:
        if name not in available_sources():
            raise HTTPException(status_code=400, detail=f"Unknown source '{name}'")
        results.append(ingest_source(db, name))
    return results


@router.get("/posts", response_model=list[PostOut])
def list_posts(
    source: str | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_session),
) -> list[Post]:
    stmt = select(Post).order_by(Post.id.desc()).limit(limit).offset(offset)
    if source:
        stmt = select(Post).where(Post.source == source).order_by(Post.id.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.get("/authors", response_model=list[AuthorOut])
def list_authors(
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_session),
) -> list[Author]:
    return list(db.scalars(select(Author).order_by(Author.id.desc()).limit(limit).offset(offset)))


@router.get("/authors/{author_id}", response_model=AuthorDetailOut)
def author_detail(author_id: int, db: Session = Depends(get_session)) -> Author:
    author = db.get(Author, author_id)
    if not author:
        raise HTTPException(status_code=404, detail="Author not found")
    return author


@router.post("/authenticity/run")
def run_authenticity(
    author_id: int | None = Query(default=None, description="one author, or all when omitted"),
    db: Session = Depends(get_session),
) -> dict:
    if author_id is not None:
        author = db.get(Author, author_id)
        if not author:
            raise HTTPException(status_code=404, detail="Author not found")
        return {"author_id": author_id, "authenticity_score": score_author(db, author)}
    return score_all(db)


@router.get("/runs")
def list_runs(limit: int = Query(default=20, le=100), db: Session = Depends(get_session)) -> list[dict]:
    runs = db.scalars(select(IngestRun).order_by(IngestRun.id.desc()).limit(limit))
    return [
        {"id": r.id, "source": r.source, "status": r.status, "fetched": r.fetched,
         "inserted": r.inserted, "duplicates": r.duplicates, "errors": r.errors,
         "started_at": r.started_at, "finished_at": r.finished_at}
        for r in runs
    ]
