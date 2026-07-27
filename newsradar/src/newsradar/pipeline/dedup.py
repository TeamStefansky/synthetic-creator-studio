"""Near-duplicate detection via a hand-rolled 64-bit SimHash.

A wire story republishes across hundreds of outlets; near-duplicate collapse is
load-bearing for every downstream metric. Two documents are near-duplicates when
their SimHash Hamming distance is ``<= HAMMING_THRESHOLD`` *and* their
``published_at`` values are within ``TIME_WINDOW``. The earliest document in a
cluster is canonical; later ones get ``dedup_of`` set.

Exact-URL duplicates are handled separately by the ``url_hash`` unique index.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Document

HAMMING_THRESHOLD = 3
TIME_WINDOW = dt.timedelta(hours=72)
_HASH_BITS = 64
_MASK64 = (1 << 64) - 1

_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def _token_hash(token: str) -> int:
    digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def simhash64(text: str) -> int:
    """Compute an unsigned 64-bit SimHash fingerprint of ``text``."""

    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        return 0

    weights = [0] * _HASH_BITS
    counts: dict[str, int] = {}
    for tok in tokens:
        counts[tok] = counts.get(tok, 0) + 1

    for tok, weight in counts.items():
        h = _token_hash(tok)
        for bit in range(_HASH_BITS):
            if (h >> bit) & 1:
                weights[bit] += weight
            else:
                weights[bit] -= weight

    fingerprint = 0
    for bit in range(_HASH_BITS):
        if weights[bit] > 0:
            fingerprint |= 1 << bit
    return fingerprint


def hamming(a: int, b: int) -> int:
    """Hamming distance between two 64-bit fingerprints (accepts signed storage)."""

    return int(((a & _MASK64) ^ (b & _MASK64)).bit_count())


def to_signed64(value: int) -> int:
    """Map an unsigned 64-bit int into the signed range for ``BIGINT`` storage."""

    value &= _MASK64
    return value - (1 << 64) if value >= (1 << 63) else value


def to_unsigned64(value: int) -> int:
    """Recover the unsigned fingerprint from a signed ``BIGINT`` value."""

    return value & _MASK64


def within_time_window(
    a: dt.datetime | None, b: dt.datetime | None, window: dt.timedelta = TIME_WINDOW
) -> bool:
    """Whether two timestamps are within ``window``.

    If either timestamp is unknown the window cannot be evaluated; we fall back
    to allowing the pairing (SimHash proximity alone must then justify a merge).
    """

    if a is None or b is None:
        return True
    return abs(a - b) <= window


def is_near_duplicate(
    hash_a: int,
    time_a: dt.datetime | None,
    hash_b: int,
    time_b: dt.datetime | None,
    *,
    threshold: int = HAMMING_THRESHOLD,
) -> bool:
    """Return True if two documents are near-duplicates."""

    return hamming(hash_a, hash_b) <= threshold and within_time_window(time_a, time_b)


async def find_duplicate_canonical(
    session: AsyncSession,
    simhash: int,
    published_at: dt.datetime | None,
    *,
    threshold: int = HAMMING_THRESHOLD,
) -> uuid.UUID | None:
    """Find the earliest existing canonical document that ``simhash`` duplicates.

    Only canonical documents (``dedup_of IS NULL``) within the time window are
    considered. Returns the canonical's id, or ``None`` if this is a new story.
    """

    stmt = select(Document.id, Document.simhash, Document.published_at).where(
        Document.dedup_of.is_(None),
        Document.simhash.is_not(None),
    )
    if published_at is not None:
        stmt = stmt.where(
            Document.published_at.is_(None)
            | (
                (Document.published_at >= published_at - TIME_WINDOW)
                & (Document.published_at <= published_at + TIME_WINDOW)
            )
        )
    stmt = stmt.order_by(Document.published_at.asc().nulls_last())

    result = await session.execute(stmt)
    for row_id, row_simhash, row_time in result.all():
        if row_simhash is None:
            continue
        if is_near_duplicate(simhash, published_at, row_simhash, row_time, threshold=threshold):
            return uuid.UUID(str(row_id))  # earliest match wins (ordered ascending)
    return None
