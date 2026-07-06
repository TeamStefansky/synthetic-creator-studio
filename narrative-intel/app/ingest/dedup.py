"""Content-based de-duplication key: hash(source + normalized text).

Normalizing (lowercase, collapse whitespace) means near-identical reposts — the
signature of coordinated campaigns — collapse to the same hash, so the same
content from one source is stored once. Cross-source duplicates are kept
separately (different `source`) on purpose, so amplification across platforms
remains visible.
"""
from __future__ import annotations

import hashlib
import re

_WS = re.compile(r"\s+")


def content_hash(source: str, text: str) -> str:
    normalized = _WS.sub(" ", (text or "").strip().lower())
    return hashlib.sha256(f"{source}\x00{normalized}".encode("utf-8")).hexdigest()
