"""SimHash near-duplicate detection, against two real near-duplicate wire stories."""

from __future__ import annotations

import datetime as dt
import uuid
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Document, Source
from newsradar.pipeline import dedup

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _dedup_text(path: Path) -> str:
    raw = (FIXTURES / path).read_text().strip()
    lines = raw.splitlines()
    title = lines[0]
    body = " ".join(lines[1:])
    return f"{title}\n{body[:500]}"


def test_near_duplicate_wire_stories_collapse() -> None:
    a = dedup.simhash64(_dedup_text(Path("dedup_wire_a.txt")))
    b = dedup.simhash64(_dedup_text(Path("dedup_wire_b.txt")))
    assert dedup.hamming(a, b) <= dedup.HAMMING_THRESHOLD


def test_distinct_stories_not_merged() -> None:
    a = dedup.simhash64(_dedup_text(Path("dedup_wire_a.txt")))
    d = dedup.simhash64(_dedup_text(Path("dedup_distinct.txt")))
    assert dedup.hamming(a, d) > dedup.HAMMING_THRESHOLD


def test_time_window_gates_near_duplicates() -> None:
    a = dedup.simhash64(_dedup_text(Path("dedup_wire_a.txt")))
    b = dedup.simhash64(_dedup_text(Path("dedup_wire_b.txt")))
    t0 = dt.datetime(2026, 7, 20, tzinfo=dt.UTC)
    within = t0 + dt.timedelta(hours=48)
    outside = t0 + dt.timedelta(hours=96)
    assert dedup.is_near_duplicate(a, t0, b, within) is True
    assert dedup.is_near_duplicate(a, t0, b, outside) is False


def test_signed64_roundtrip() -> None:
    for value in (0, 1, (1 << 63) - 1, 1 << 63, (1 << 64) - 1):
        signed = dedup.to_signed64(value)
        assert -(1 << 63) <= signed < (1 << 63)
        assert dedup.to_unsigned64(signed) == value


@pytest.mark.asyncio
async def test_find_duplicate_canonical_in_db(session: AsyncSession) -> None:
    source = Source(
        name="Wire", domain=f"wire-{uuid.uuid4().hex}.example", source_type="news", tier=1
    )
    session.add(source)
    await session.flush()

    t0 = dt.datetime(2026, 7, 20, tzinfo=dt.UTC)
    a_hash = dedup.simhash64(_dedup_text(Path("dedup_wire_a.txt")))
    b_hash = dedup.simhash64(_dedup_text(Path("dedup_wire_b.txt")))
    d_hash = dedup.simhash64(_dedup_text(Path("dedup_distinct.txt")))

    canonical = Document(
        source_id=source.id,
        url="https://wire.example/a",
        canonical_url="https://wire.example/a",
        url_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        simhash=dedup.to_signed64(a_hash),
        title="wire a",
        published_at=t0,
        media_type="article",
    )
    session.add(canonical)
    await session.commit()

    # A near-duplicate within the window resolves to the canonical.
    found = await dedup.find_duplicate_canonical(session, b_hash, t0 + dt.timedelta(hours=2))
    assert found == canonical.id

    # A distinct story finds no canonical.
    assert await dedup.find_duplicate_canonical(session, d_hash, t0) is None

    # Outside the time window, even a near-duplicate is not merged.
    assert (
        await dedup.find_duplicate_canonical(session, b_hash, t0 + dt.timedelta(hours=96)) is None
    )
