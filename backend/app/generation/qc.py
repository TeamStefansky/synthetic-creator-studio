"""QC — visual-consistency check against the persona's stored visual identity.

A real check would embed the output and the persona's reference set and compare
in feature space (e.g. face/style embeddings) with a similarity threshold. Here
we compare the dominant color the stub emitted against the persona's stored
``base_color`` as a stand-in, returning a 0..1 score + pass/fail.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class QCResult:
    passed: bool
    score: float
    detail: str = ""


def _color_distance(a, b) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def check_visual_consistency(
    *, visual_identity: dict | None, result_meta: dict, threshold: float = 0.6
) -> QCResult:
    if not visual_identity or "base_color" not in visual_identity:
        # Nothing to compare against → neutral pass, but flagged in detail.
        return QCResult(passed=True, score=1.0, detail="no stored visual identity; skipped")

    ref = visual_identity.get("base_color")
    got = result_meta.get("dominant_color")
    if not (isinstance(ref, (list, tuple)) and isinstance(got, (list, tuple))):
        return QCResult(passed=True, score=1.0, detail="no comparable color signal")

    dist = _color_distance(ref, got)  # 0..441 for RGB
    score = max(0.0, 1.0 - dist / 441.0)
    return QCResult(
        passed=score >= threshold,
        score=round(score, 4),
        detail=f"color distance={dist:.1f}, score={score:.3f}, threshold={threshold}",
    )
