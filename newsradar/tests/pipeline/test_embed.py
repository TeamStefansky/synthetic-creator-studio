"""Embedding tests using the deterministic HashingEmbedder (no model download)."""

from __future__ import annotations

import math

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import DocumentEnrichment
from newsradar.pipeline.embed import HashingEmbedder, embed_documents, embedding_input
from tests.pipeline import _factories as f


def test_deterministic_same_text_same_vector() -> None:
    emb = HashingEmbedder()
    a = emb.embed_passages(["a summit on trade policy in geneva"])[0]
    b = emb.embed_passages(["a summit on trade policy in geneva"])[0]
    assert a == b


def test_vectors_are_unit_length() -> None:
    emb = HashingEmbedder()
    vecs = emb.embed_passages(["hello world", "entirely different tokens here"])
    for v in vecs:
        assert math.isclose(math.sqrt(sum(x * x for x in v)), 1.0, rel_tol=1e-6)


def test_embedding_input_shape() -> None:
    assert embedding_input("Title", "Summ", None) == "Title\nSumm"
    assert embedding_input("Title", None, "body text") == "Title\nbody text"
    assert embedding_input(None, None, "b" * 5000).count("b") == 2000


@pytest.mark.asyncio
async def test_embed_documents_writes_and_is_idempotent(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "reuters.com")
    d1 = await f.make_document(session, src, title="Summit opens", summary="Leaders meet.")
    d2 = await f.make_document(session, src, title="Market falls", summary="Stocks drop.")
    await session.commit()

    emb = HashingEmbedder()
    n = await embed_documents(session, emb)
    assert n == 2

    rows = (
        (
            await session.execute(
                select(DocumentEnrichment).where(DocumentEnrichment.document_id.in_([d1.id, d2.id]))
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    assert all(r.embedding is not None and len(r.embedding) == 1024 for r in rows)

    # Idempotent: a second run embeds nothing new.
    assert await embed_documents(session, emb) == 0
    # force re-embeds.
    assert await embed_documents(session, emb, force=True) == 2
