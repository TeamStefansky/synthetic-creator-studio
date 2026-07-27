"""Human spot-check for entity-targeted stance assessments.

Usage::

    uv run python scripts/stance_audit.py --entity "Prime Minister" --limit 20

Prints, for each assessment of the named entity, the document title, the stance
and confidence, and the verbatim evidence span — so a human can verify the
evidence actually supports the score.
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from newsradar.db.models import Document, StanceAssessment, WatchlistEntity
from newsradar.db.session import get_sessionmaker

_LABELS = {-2: "hostile", -1: "critical", 0: "neutral", 1: "favorable", 2: "laudatory"}


async def _audit(entity_name: str, limit: int) -> int:
    factory = get_sessionmaker()
    async with factory() as session:
        rows = (
            await session.execute(
                select(
                    Document.title,
                    StanceAssessment.stance,
                    StanceAssessment.confidence,
                    StanceAssessment.framing,
                    StanceAssessment.evidence_span,
                )
                .join(StanceAssessment, StanceAssessment.document_id == Document.id)
                .join(WatchlistEntity, WatchlistEntity.id == StanceAssessment.entity_id)
                .where(WatchlistEntity.name == entity_name)
                .order_by(StanceAssessment.created_at.desc())
                .limit(limit)
            )
        ).all()

    if not rows:
        print(f"no stance assessments found for entity {entity_name!r}")
        return 0

    for title, stance, confidence, framing, evidence in rows:
        label = _LABELS.get(int(stance), str(stance))
        conf = f"{confidence:.2f}" if confidence is not None else "n/a"
        print(f"[{stance:+d} {label:<9} conf={conf}] {title or '(untitled)'}")
        print(f"    framing : {framing or '-'}")
        print(f"    evidence: {evidence or '-'}")
        print()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit entity-targeted stance assessments.")
    parser.add_argument("--entity", required=True)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args(argv)
    return asyncio.run(_audit(args.entity, args.limit))


if __name__ == "__main__":
    raise SystemExit(main())
