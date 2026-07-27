"""Cheap-tier enrichment: language, is_opinion, prominence, entities, geo, sentiment.

Runs on every non-duplicate document. Heuristics (language confirmation,
``is_opinion``, ``prominence``) are computed locally; named entities and overall
sentiment come from one batched Haiku call per 10 documents (structured output,
never free-text). Place entities are resolved to coordinates against the bundled
GeoNames extract, unless the connector already supplied lat/lon in ``raw``.

Cost discipline: this is the Haiku tier — cheap, batched, all documents. Sonnet
is used only on event representatives (see :mod:`newsradar.pipeline.summarize`).
"""

from __future__ import annotations

import datetime as dt
import re
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import Document, DocumentEnrichment, DocumentMatch
from newsradar.llm.client import BudgetExceeded, LLMClient
from newsradar.llm.schemas import DocumentEnrichmentOut, EnrichmentBatchOut
from newsradar.logging import get_logger
from newsradar.pipeline.geonames import GeoNamesResolver
from newsradar.pipeline.matcher import _compile_term_regex

log = get_logger(__name__)

ENRICH_BATCH_SIZE = 10

# --- is_opinion heuristics -----------------------------------------------------------

_OPINION_PATH_SEGMENTS = (
    "/opinion",
    "/opinions",
    "/commentary",
    "/editorial",
    "/editorials",
    "/oped",
    "/op-ed",
    "/blogs",
    "/blog/",
    "/columns",
    "/columnists",
    "/analysis",
)
_OPINION_SECTIONS = frozenset(
    {"opinion", "editorial", "commentary", "op-ed", "oped", "column", "analysis", "blog"}
)
# Title prefixes across the monitored languages (English, Hebrew, Arabic).
_OPINION_TITLE_RE = re.compile(
    r"^\s*(opinion|analysis|editorial|op-?ed|commentary|column|דעה|טור|מאמר|رأي|تحليل|مقال)\s*[:\-–|]",
    re.IGNORECASE | re.UNICODE,
)


def detect_is_opinion(url: str | None, title: str | None, section: str | None = None) -> bool:
    """Heuristic opinion detector from source section, URL path and title patterns."""

    if section and section.strip().lower() in _OPINION_SECTIONS:
        return True
    if url:
        path = url.lower()
        if any(seg in path for seg in _OPINION_PATH_SEGMENTS):
            return True
    return bool(title and _OPINION_TITLE_RE.search(title))


# --- prominence ----------------------------------------------------------------------


def _first_paragraph(text: str) -> str:
    stripped = text.strip()
    para = re.split(r"\n\s*\n", stripped, maxsplit=1)[0]
    return para


def compute_prominence(
    matched_terms: Sequence[str], title: str | None, body: str | None
) -> float | None:
    """Positional prominence of watchlist terms (see the P2 spec).

    1.0 in the title, 0.7 in the first paragraph, 0.4 in the first third of the
    body, 0.15 elsewhere in the body, 0 if absent. Combined across terms by max.
    Returns ``None`` when there are no terms to locate.
    """

    if not matched_terms:
        return None
    title_text = title or ""
    body_text = body or ""
    first_para = _first_paragraph(body_text)
    third_len = max(1, len(body_text) // 3)
    first_third = body_text[:third_len]

    best = 0.0
    for term in matched_terms:
        pattern = _compile_term_regex(term)
        if title_text and pattern.search(title_text):
            best = max(best, 1.0)
        elif first_para and pattern.search(first_para):
            best = max(best, 0.7)
        elif first_third and pattern.search(first_third):
            best = max(best, 0.4)
        elif body_text and pattern.search(body_text):
            best = max(best, 0.15)
    return best


# --- entities + geo ------------------------------------------------------------------

_ENRICH_SYSTEM = (
    "You are a multilingual news analyst. For each numbered document, extract named "
    "entities (person, org, place, product) with character offsets into the provided "
    "text, a short list of topics, and an overall sentiment of the document from -1 "
    "(very negative) to 1 (very positive). Sentiment is the tone of the article as a "
    "whole, not toward any particular entity. Confirm the primary language as an ISO "
    "639-1 code. Return one result per document, keyed by its doc_index."
)


def _doc_enrich_text(doc: Document) -> str:
    return "\n".join(p for p in (doc.title, doc.summary or (doc.body or "")[:1500]) if p)


def _build_enrich_prompt(docs: Sequence[Document]) -> str:
    lines = []
    for i, doc in enumerate(docs):
        lines.append(f"[doc_index={i}] lang_hint={doc.lang or 'unknown'}")
        lines.append(_doc_enrich_text(doc) or "(no text)")
        lines.append("")
    return "\n".join(lines)


def _raw_latlon(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Trust connector-supplied coordinates (e.g. Perigon) when present in ``raw``."""

    if not raw:
        return None
    lat = raw.get("lat") if raw.get("lat") is not None else raw.get("latitude")
    lon = raw.get("lon") if raw.get("lon") is not None else raw.get("longitude")
    if lat is None or lon is None:
        return None
    try:
        return {
            "country_code": raw.get("country_code") or raw.get("country"),
            "admin1": raw.get("admin1"),
            "lat": float(lat),
            "lon": float(lon),
            "confidence": 1.0,
            "source": "connector",
        }
    except (TypeError, ValueError):
        return None


def _resolve_geo(
    enrichment: DocumentEnrichmentOut, doc: Document, geo: GeoNamesResolver
) -> dict[str, Any] | None:
    trusted = _raw_latlon(doc.raw)
    if trusted is not None:
        return trusted
    for ent in enrichment.entities:
        if ent.entity_type == "place":
            resolved = geo.resolve(ent.text)
            if resolved is not None:
                return {**resolved, "name": ent.text, "source": "geonames"}
    return None


async def _matched_terms_for(
    session: AsyncSession, doc_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[str]]:
    rows = (
        await session.execute(
            select(DocumentMatch.document_id, DocumentMatch.matched_terms).where(
                DocumentMatch.document_id.in_(doc_ids)
            )
        )
    ).all()
    out: dict[uuid.UUID, list[str]] = {}
    for doc_id, terms in rows:
        bucket = out.setdefault(doc_id, [])
        for t in terms or []:
            if t not in bucket:
                bucket.append(t)
    return out


async def _docs_needing_enrichment(
    session: AsyncSession, watchlist_id: uuid.UUID | None, force: bool
) -> list[Document]:
    stmt = select(Document).where(Document.dedup_of.is_(None))
    if watchlist_id is not None:
        stmt = stmt.where(
            Document.id.in_(
                select(DocumentMatch.document_id).where(DocumentMatch.watchlist_id == watchlist_id)
            )
        )
    if not force:
        enriched = select(DocumentEnrichment.document_id).where(
            DocumentEnrichment.enriched_at.is_not(None)
        )
        stmt = stmt.where(Document.id.not_in(enriched))
    return list((await session.execute(stmt)).scalars().all())


async def enrich_documents(
    session: AsyncSession,
    llm: LLMClient,
    geo: GeoNamesResolver,
    *,
    watchlist_id: uuid.UUID | None = None,
    force: bool = False,
) -> int:
    """Enrich non-duplicate documents; returns the number enriched.

    Idempotent: a document with ``enriched_at`` set is skipped unless ``force``.
    On :class:`BudgetExceeded` the batch is skipped and its documents are left
    unenriched (``enriched_at IS NULL``) so enrichment degrades gracefully to
    embeddings + heuristics only.
    """

    settings = get_settings()
    docs = await _docs_needing_enrichment(session, watchlist_id, force)
    if not docs:
        return 0
    terms_by_doc = await _matched_terms_for(session, [d.id for d in docs])

    enriched = 0
    for start in range(0, len(docs), ENRICH_BATCH_SIZE):
        chunk = docs[start : start + ENRICH_BATCH_SIZE]
        try:
            batch = await llm.generate_structured(
                purpose="enrich_entities",
                model=settings.haiku_model,
                system=_ENRICH_SYSTEM,
                user=_build_enrich_prompt(chunk),
                response_model=EnrichmentBatchOut,
            )
        except BudgetExceeded:
            log.warning("enrich.budget_exceeded", skipped=len(chunk))
            break

        by_index = {o.doc_index: o for o in batch.documents}
        rows: list[dict[str, Any]] = []
        now = dt.datetime.now(dt.UTC)
        for i, doc in enumerate(chunk):
            out = by_index.get(i)
            if out is None:
                continue
            geo_dict = _resolve_geo(out, doc, geo)
            rows.append(
                {
                    "document_id": doc.id,
                    "entities": [e.model_dump() for e in out.entities],
                    "topics": out.topics or None,
                    "geo": geo_dict,
                    "sentiment_overall": out.sentiment_overall,
                    "prominence": compute_prominence(
                        terms_by_doc.get(doc.id, []), doc.title, doc.body or doc.summary
                    ),
                    "is_opinion": detect_is_opinion(
                        doc.url, doc.title, (doc.raw or {}).get("section")
                    ),
                    "enriched_at": now,
                    "model_version": settings.haiku_model,
                }
            )
        if rows:
            await _upsert_enrichment(session, rows)
            enriched += len(rows)

    await session.commit()
    log.info("enrich.documents", enriched=enriched, forced=force)
    return enriched


async def _upsert_enrichment(session: AsyncSession, rows: list[dict[str, Any]]) -> None:
    stmt = pg_insert(DocumentEnrichment).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["document_id"],
        set_={
            "entities": stmt.excluded.entities,
            "topics": stmt.excluded.topics,
            "geo": stmt.excluded.geo,
            "sentiment_overall": stmt.excluded.sentiment_overall,
            "prominence": stmt.excluded.prominence,
            "is_opinion": stmt.excluded.is_opinion,
            "enriched_at": stmt.excluded.enriched_at,
            "model_version": stmt.excluded.model_version,
        },
    )
    await session.execute(stmt)
