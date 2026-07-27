"""Hallucination guard: every number in a report must come from its context.

The report renderer is instructed never to invent figures. This module is the
mechanical check behind that promise: it collects every numeric value in the
:class:`~newsradar.reports.context.ReportContext` and verifies each numeric figure
in the rendered markdown matches one of them — allowing for rounding and
share↔percent conversion, and ignoring ids, dates and URLs (which carry digits
that are not "figures").
"""

from __future__ import annotations

import re
from typing import Any

# Tokens that carry digits but are not figures — stripped before scanning markdown.
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_ISO_DT_RE = re.compile(r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:[.+\-Z][\d:]*)?)?")
_URL_RE = re.compile(r"https?://\S+")
_H3_RE = re.compile(r"\b[0-9a-f]{15}\b", re.I)  # H3 cell tokens
_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


def collect_numbers(obj: Any) -> set[float]:
    """Recursively collect every int/float from a JSON-like structure."""

    out: set[float] = set()

    def _walk(node: Any) -> None:
        if isinstance(node, bool):
            return
        if isinstance(node, int | float):
            out.add(float(node))
        elif isinstance(node, dict):
            for v in node.values():
                _walk(v)
        elif isinstance(node, list | tuple):
            for v in node:
                _walk(v)

    _walk(obj)
    return out


def extract_markdown_numbers(markdown: str) -> list[float]:
    """Numbers that look like *figures* in the markdown (ids/dates/urls removed)."""

    cleaned = _URL_RE.sub(" ", markdown)
    cleaned = _UUID_RE.sub(" ", cleaned)
    cleaned = _ISO_DT_RE.sub(" ", cleaned)
    cleaned = _H3_RE.sub(" ", cleaned)
    return [float(tok) for tok in _NUMBER_RE.findall(cleaned)]


def _matches(value: float, context: set[float]) -> bool:
    """Whether ``value`` matches any context number under rounding/percent rules."""

    for c in context:
        if abs(value - c) <= 0.011:
            return True
        for ndigits in (0, 1, 2, 3):
            if round(c, ndigits) == value:
                return True
            # share (0-1) rendered as a percentage (0-100)
            if round(c * 100.0, ndigits) == value:
                return True
    return False


def unmatched_numbers(markdown: str, context: Any) -> list[float]:
    """Figures present in the markdown but absent from the context (should be empty)."""

    ctx_numbers = context if isinstance(context, set) else collect_numbers(context)
    return [n for n in extract_markdown_numbers(markdown) if not _matches(n, ctx_numbers)]
