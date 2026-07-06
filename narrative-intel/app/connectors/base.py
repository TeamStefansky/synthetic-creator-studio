"""SourceConnector — the uniform interface every source implements.

A connector knows how to fetch raw items from one source and normalize each into
a NormalizedPost. The ingest service treats every source identically through
this interface, so adding a source never touches the pipeline.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..schemas import NormalizedPost


class RateLimit:
    """Simple declared rate limit (requests per window) for schedulers/backoff."""

    def __init__(self, requests: int, per_seconds: int) -> None:
        self.requests = requests
        self.per_seconds = per_seconds


class SourceConnector(ABC):
    #: short stable id, e.g. "x", "telegram", "rss", "newsapi"
    name: str = "base"
    rate_limit: RateLimit = RateLimit(60, 60)

    @abstractmethod
    def fetch(self) -> list[dict]:
        """Return raw source items (dicts). Network lives here."""

    @abstractmethod
    def normalize(self, raw: dict) -> NormalizedPost:
        """Map one raw item to the normalized post schema. May raise on bad data."""

    def health(self) -> dict:
        """Report connector readiness (has creds? using mock?)."""
        return {"source": self.name, "ok": True, "mock": True}
