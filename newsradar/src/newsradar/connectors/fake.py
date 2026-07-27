"""A deterministic in-memory connector for tests and offline pipeline runs."""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator

from newsradar.connectors.base import (
    BaseConnector,
    ConnectorError,
    HealthStatus,
    RawDocument,
    WatchlistQuery,
)
from newsradar.db.models import SourceType


class FakeConnector(BaseConnector):
    """Yields a fixed list of documents; can be told to raise, to test isolation."""

    name = "fake"
    source_type = SourceType.news
    default_interval_seconds = 600
    required_env = ()

    def __init__(
        self,
        documents: list[RawDocument] | None = None,
        *,
        name: str = "fake",
        raise_on_fetch: bool = False,
        healthy: bool = True,
    ) -> None:
        self.name = name
        self._documents = documents or []
        self._raise_on_fetch = raise_on_fetch
        self._healthy = healthy

    async def fetch(self, query: WatchlistQuery, since: dt.datetime) -> AsyncIterator[RawDocument]:
        if self._raise_on_fetch:
            raise ConnectorError(f"{self.name}: simulated fetch failure")
        for doc in self._documents:
            yield doc

    async def health_check(self) -> HealthStatus:
        return HealthStatus(healthy=self._healthy, detail=None if self._healthy else "unhealthy")
