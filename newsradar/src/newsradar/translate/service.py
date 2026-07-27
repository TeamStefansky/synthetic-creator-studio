"""Cached document translation into the reader's language (P6).

Design (every point is a tested gate):

* **Cache by content hash, not document id.** ``content_hash`` is the sha256 of
  the *source* text; re-ingesting the same article (a new ``documents`` row with
  identical text) reuses the cached translation and spends no tokens. Re-running
  translation on unchanged text is a no-op.
* **English passes through.** A document whose ``lang`` already equals the target
  is copied through with ``model='passthrough'`` and ZERO LLM calls.
* **Body is licensing-gated in the service, not the caller.** ``body`` is
  translated only when the source's ``content_rights`` is ``full_ok``; ``title``
  and ``extract`` are always translated. The gate lives here so no call site can
  bypass it.
* **Failures degrade gracefully.** A failed translation keeps the original-language
  text with ``model='failed'`` so a headline is never blank; the status surfaces
  in the API.

Only documents entering an edition or a digest are ever passed here — never the
whole corpus (a hard cost rule).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import ContentRights, Document, Source, Translation, TranslationField
from newsradar.llm.client import LLMClient
from newsradar.llm.prompt_loader import load_prompt
from newsradar.llm.schemas import TranslationBatchOut
from newsradar.logging import get_logger

log = get_logger(__name__)

TRANSLATE_PURPOSE = "translate"
PASSTHROUGH_MODEL = "passthrough"
FAILED_MODEL = "failed"
DEFAULT_BATCH_SIZE = 12
_UNKNOWN_LANG = "und"


def content_hash(text: str) -> str:
    """sha256 hex of the source text — the translation cache key."""

    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass
class TranslationSummary:
    """Counters for one :func:`translate_documents` run (drives the cost gate)."""

    translated: int = 0  # fields freshly translated by the model
    cache_hits: int = 0  # fields resolved from the content-hash cache
    passthrough: int = 0  # fields copied through (English source)
    unchanged: int = 0  # fields already present with the same content hash
    failed: int = 0  # fields kept in original language after a failed call
    llm_calls: int = 0  # successful LLM batch calls made
    docs_via_llm: set[str] = field(default_factory=set)  # doc ids sent to the model

    @property
    def documents_translated(self) -> int:
        """Distinct documents that required an LLM call (the cost-scope figure)."""

        return len(self.docs_via_llm)


def _chunk[T](items: Sequence[T], size: int) -> Iterable[Sequence[T]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


async def translate_documents(
    session: AsyncSession,
    llm: LLMClient,
    doc_ids: Sequence[object],
    *,
    target_lang: str = "en",
    model: str | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> TranslationSummary:
    """Translate the title/extract (and, for ``full_ok`` sources, body) of each
    document into ``target_lang`` and upsert cached rows. Returns a summary."""

    settings = get_settings()
    model = model or settings.haiku_model
    summary = TranslationSummary()

    ordered_ids = list(dict.fromkeys(doc_ids))
    if not ordered_ids:
        return summary

    rows = (
        await session.execute(
            select(Document, Source.content_rights)
            .join(Source, Source.id == Document.source_id)
            .where(Document.id.in_(ordered_ids))
        )
    ).all()
    by_id = {doc.id: (doc, rights) for doc, rights in rows}
    docs = [by_id[i] for i in ordered_ids if i in by_id]

    # Existing rows for these documents (to detect "already up to date").
    existing: dict[tuple[object, TranslationField], Translation] = {}
    for t in (
        (
            await session.execute(
                select(Translation).where(
                    Translation.document_id.in_(ordered_ids),
                    Translation.target_lang == target_lang,
                )
            )
        )
        .scalars()
        .all()
    ):
        existing[(t.document_id, t.field)] = t

    # Build the per-document field plan and the set of content hashes we need.
    plan: list[tuple[Document, list[tuple[TranslationField, str, str]]]] = []
    needed_hashes: set[str] = set()
    for doc, rights in docs:
        fields: list[tuple[TranslationField, str | None]] = [
            (TranslationField.title, doc.title),
            (TranslationField.extract, doc.summary),
        ]
        if rights == ContentRights.full_ok:
            fields.append((TranslationField.body, doc.body))
        entries = [
            (f, txt.strip(), content_hash(txt.strip())) for f, txt in fields if txt and txt.strip()
        ]
        plan.append((doc, entries))
        needed_hashes.update(h for _, _, h in entries)

    # Content-hash cache (across ALL documents, not just these) — never a failed row.
    cache: dict[tuple[TranslationField, str], tuple[str, str, str | None]] = {}
    if needed_hashes:
        for f, h, txt, mdl, src in (
            await session.execute(
                select(
                    Translation.field,
                    Translation.content_hash,
                    Translation.text,
                    Translation.model,
                    Translation.source_lang,
                ).where(
                    Translation.target_lang == target_lang,
                    Translation.content_hash.in_(needed_hashes),
                    Translation.model != FAILED_MODEL,
                )
            )
        ).all():
            cache.setdefault((f, h), (txt, mdl, src))

    upserts: list[dict[str, object]] = []
    pending: list[tuple[Document, TranslationField, str, str]] = []

    def _row(
        doc_id: object, f: TranslationField, txt: str, mdl: str, src: str | None, h: str
    ) -> None:
        upserts.append(
            {
                "document_id": doc_id,
                "target_lang": target_lang,
                "field": f,
                "source_lang": src,
                "text": txt,
                "model": mdl,
                "content_hash": h,
            }
        )

    for doc, entries in plan:
        passthrough = doc.lang == target_lang
        for f, txt, h in entries:
            ex = existing.get((doc.id, f))
            if ex is not None and ex.content_hash == h and ex.model != FAILED_MODEL:
                summary.unchanged += 1
                continue
            if passthrough:
                _row(doc.id, f, txt, PASSTHROUGH_MODEL, doc.lang, h)
                summary.passthrough += 1
                continue
            cached = cache.get((f, h))
            if cached is not None:
                ctext, cmodel, csrc = cached
                _row(doc.id, f, ctext, cmodel, csrc, h)
                summary.cache_hits += 1
                continue
            pending.append((doc, f, txt, h))

    # Group pending fields by document, then batch documents.
    pend_by_doc: dict[object, tuple[Document, list[tuple[TranslationField, str, str]]]] = {}
    for doc, f, txt, h in pending:
        pend_by_doc.setdefault(doc.id, (doc, []))[1].append((f, txt, h))
    doc_units = list(pend_by_doc.values())

    prompt = load_prompt("translate.md")
    run_cache: dict[tuple[TranslationField, str], tuple[str, str, str]] = {}

    for chunk in _chunk(doc_units, batch_size):
        payload: list[dict[str, object]] = []
        chunk_meta: list[tuple[Document, dict[TranslationField, tuple[str, str]]]] = []
        for doc, entries in chunk:
            item: dict[str, object] = {"doc_index": len(payload)}
            fld_map: dict[TranslationField, tuple[str, str]] = {}
            for f, txt, h in entries:
                rc = run_cache.get((f, h))
                if rc is not None:
                    rtext, rmodel, rsrc = rc
                    _row(doc.id, f, rtext, rmodel, rsrc, h)
                    summary.cache_hits += 1
                    continue
                item[f.value] = txt
                fld_map[f] = (txt, h)
            if fld_map:
                payload.append(item)
                chunk_meta.append((doc, fld_map))
        if not payload:
            continue

        try:
            out = await llm.generate_structured(
                purpose=TRANSLATE_PURPOSE,
                model=model,
                system=prompt,
                user=json.dumps(payload, ensure_ascii=False),
                response_model=TranslationBatchOut,
            )
        except Exception as exc:  # noqa: BLE001 - a failed translation must never blank a headline
            log.warning("translate.batch_failed", error=str(exc), docs=len(payload))
            for doc, fld_map in chunk_meta:
                summary.docs_via_llm.add(str(doc.id))
                for f, (txt, h) in fld_map.items():
                    _row(doc.id, f, txt, FAILED_MODEL, doc.lang or _UNKNOWN_LANG, h)
                    summary.failed += 1
            continue

        summary.llm_calls += 1
        result_by_index = {d.doc_index: d for d in out.documents}
        for local_index, (doc, fld_map) in enumerate(chunk_meta):
            summary.docs_via_llm.add(str(doc.id))
            result = result_by_index.get(local_index)
            src_lang = (
                result.source_lang if result and result.source_lang else (doc.lang or _UNKNOWN_LANG)
            )
            for f, (txt, h) in fld_map.items():
                translated = getattr(result, f.value, None) if result else None
                if translated and str(translated).strip():
                    value = str(translated).strip()
                    _row(doc.id, f, value, model, src_lang, h)
                    run_cache[(f, h)] = (value, model, src_lang)
                    summary.translated += 1
                else:
                    _row(doc.id, f, txt, FAILED_MODEL, doc.lang or _UNKNOWN_LANG, h)
                    summary.failed += 1

    if upserts:
        stmt = pg_insert(Translation).values(upserts)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_translations_doc_lang_field",
            set_={
                "text": stmt.excluded.text,
                "model": stmt.excluded.model,
                "source_lang": stmt.excluded.source_lang,
                "content_hash": stmt.excluded.content_hash,
            },
        )
        await session.execute(stmt)
        await session.commit()

    log.info(
        "translate.done",
        translated=summary.translated,
        cache_hits=summary.cache_hits,
        passthrough=summary.passthrough,
        failed=summary.failed,
        llm_calls=summary.llm_calls,
        docs_via_llm=summary.documents_translated,
    )
    return summary
