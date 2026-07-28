"""Document embeddings.

The embedding *provider* is abstracted behind :class:`Embedder` so the bulk
pipeline can run against the production ``sentence-transformers`` model in prod
and a small deterministic embedder in tests. Both return **L2-normalised**
1024-dim vectors, so cosine similarity is a plain dot product downstream.

Every non-duplicate *and* duplicate document is embedded (duplicates are embedded
but never clustered — see :mod:`newsradar.pipeline.cluster`). The embedding input
is ``title + "\\n" + (summary or body[:2000])``.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from typing import Protocol, cast, runtime_checkable

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import Document, DocumentEnrichment
from newsradar.logging import get_logger

log = get_logger(__name__)

EMBED_DIM = 1024
BODY_CHARS = 2000
_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def embedding_input(title: str | None, summary: str | None, body: str | None) -> str:
    """Build the text embedded for a document: ``title + "\\n" + (summary or body[:2000])``."""

    head = (title or "").strip()
    tail = (summary or (body[:BODY_CHARS] if body else "") or "").strip()
    if head and tail:
        return f"{head}\n{tail}"
    return head or tail


def _l2_normalize(matrix: NDArray[np.float32]) -> NDArray[np.float32]:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (matrix / norms).astype(np.float32)


@runtime_checkable
class Embedder(Protocol):
    """A batched text embedder returning L2-normalised ``dim``-length vectors."""

    dim: int

    def embed_passages(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed a batch of passages; returns one unit vector per input."""
        ...

    def embed_queries(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed a batch of *queries* (e5 ``query: `` role); returns one unit vector each.

        Interest descriptions are embedded as queries and compared against
        document (passage) embeddings by cosine similarity.
        """
        ...


class HashingEmbedder:
    """Deterministic hashing (bag-of-tokens) embedder — no model download.

    Each token is hashed to a dimension and its term frequency accumulated;
    the vector is L2-normalised. The same text always yields the same vector,
    and documents that share vocabulary land near each other in cosine space —
    which makes it a faithful, deterministic stand-in for a real sentence
    embedder in tests (never random, never a faked "real" embedding).
    """

    def __init__(self, dim: int = EMBED_DIM) -> None:
        self.dim = dim

    def _vector(self, text: str) -> NDArray[np.float32]:
        vec = np.zeros(self.dim, dtype=np.float32)
        for token in _TOKEN_RE.findall(text.lower()):
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            idx = int.from_bytes(digest, "big") % self.dim
            vec[idx] += 1.0
        return vec

    def embed_passages(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        matrix = np.vstack([self._vector(t) for t in texts])
        return cast("list[list[float]]", _l2_normalize(matrix).tolist())

    def embed_queries(self, texts: Sequence[str]) -> list[list[float]]:
        # Bag-of-tokens is role-agnostic, so queries and passages share vector
        # space directly — a faithful, deterministic stand-in for e5 in tests.
        return self.embed_passages(texts)


class SentenceTransformerEmbedder:
    """Production embedder: ``intfloat/multilingual-e5-large`` via sentence-transformers.

    Imported lazily so the dependency (torch, transformers) is only required when
    embeddings actually run. Inputs are prefixed with ``passage: `` per the e5
    contract, embedded in batches on GPU when available, and normalised to unit
    length. The model is loaded on first use.
    """

    dim = EMBED_DIM

    def __init__(self, model_name: str | None = None, batch_size: int | None = None) -> None:
        settings = get_settings()
        self._model_name = model_name or settings.embedding_model
        self._batch_size = batch_size or settings.embedding_batch_size
        self._model: object | None = None

    def _load(self) -> object:
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:  # pragma: no cover - optional dependency
                raise RuntimeError(
                    "sentence-transformers is not installed; install the 'embeddings' "
                    "extra (uv sync --extra embeddings) to use SentenceTransformerEmbedder."
                ) from exc
            device = "cuda" if _cuda_available() else "cpu"
            self._model = SentenceTransformer(self._model_name, device=device)
        return self._model

    def embed_passages(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load()
        prefixed = [f"passage: {t}" for t in texts]
        vectors = model.encode(  # type: ignore[attr-defined]
            prefixed,
            batch_size=self._batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return [list(map(float, row)) for row in vectors]

    def embed_queries(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load()
        prefixed = [f"query: {t}" for t in texts]
        vectors = model.encode(  # type: ignore[attr-defined]
            prefixed,
            batch_size=self._batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return [list(map(float, row)) for row in vectors]


def _cuda_available() -> bool:  # pragma: no cover - depends on hardware
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001
        return False


async def _documents_needing_embedding(
    session: AsyncSession, document_ids: Sequence[object] | None, force: bool
) -> list[Document]:
    stmt = select(Document)
    if document_ids is not None:
        stmt = stmt.where(Document.id.in_(list(document_ids)))
    if not force:
        # Left-join enrichment and keep rows without an embedding yet.
        existing = select(DocumentEnrichment.document_id).where(
            DocumentEnrichment.embedding.is_not(None)
        )
        stmt = stmt.where(Document.id.not_in(existing))
    return list((await session.execute(stmt)).scalars().all())


async def embed_documents(
    session: AsyncSession,
    embedder: Embedder,
    *,
    document_ids: Sequence[object] | None = None,
    force: bool = False,
    batch_size: int = 32,
) -> int:
    """Embed documents and upsert their vectors into ``document_enrichment``.

    Returns the number of documents embedded. Idempotent: a document that already
    has an embedding is skipped unless ``force`` is passed.
    """

    docs = await _documents_needing_embedding(session, document_ids, force)
    if not docs:
        return 0

    embedded = 0
    for start in range(0, len(docs), batch_size):
        chunk = docs[start : start + batch_size]
        texts = [embedding_input(d.title, d.summary, d.body) for d in chunk]
        vectors = embedder.embed_passages(texts)
        rows = [
            {"document_id": d.id, "embedding": vec} for d, vec in zip(chunk, vectors, strict=True)
        ]
        stmt = pg_insert(DocumentEnrichment).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["document_id"], set_={"embedding": stmt.excluded.embedding}
        )
        await session.execute(stmt)
        embedded += len(chunk)

    await session.commit()
    log.info("embed.documents", embedded=embedded, forced=force)
    return embedded


def default_embedder() -> Embedder:
    """Build the production embedder from settings.

    Honors ``EMBEDDING_PROVIDER``: the default ``"sentence-transformer"`` loads the
    real multilingual-e5-large model; ``"hashing"`` returns the deterministic,
    torch-free :class:`HashingEmbedder` (same 1024 dims → schema-compatible) so a
    constrained host can run the full pipeline without the heavy ML stack. The
    hashing provider trades semantic quality for zero model download — a real
    deterministic embedder, never a faked one.
    """

    provider = get_settings().embedding_provider.strip().lower()
    if provider in {"hashing", "hash"}:
        return HashingEmbedder()
    return SentenceTransformerEmbedder()
