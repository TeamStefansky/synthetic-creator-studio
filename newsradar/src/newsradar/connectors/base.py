"""Connector contracts shared by every data source.

A connector's only job is to turn a source (GDELT, an RSS feed, a Telegram
channel, ...) into a stream of :class:`RawDocument` objects. Connectors never
touch the database and never normalise or deduplicate — that is the pipeline's
job. They are constructed from :class:`~newsradar.config.Settings` and are
enabled only when their required environment variables are present.
"""

from __future__ import annotations

import abc
import datetime as dt
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from newsradar.db.models import MediaType, SourceType


class ConnectorError(RuntimeError):
    """Raised by a connector when a fetch fails in a non-recoverable way."""


class QueryTerm(BaseModel):
    """A single watchlist term, flattened for use by connectors and the matcher."""

    model_config = ConfigDict(frozen=True)

    text: str
    term_type: str = "keyword"
    lang: str | None = None
    is_exclusion: bool = False
    weight: float = 1.0


class WatchlistQuery(BaseModel):
    """Everything a connector needs to query a source on behalf of a watchlist."""

    watchlist_id: UUID
    name: str
    terms: list[QueryTerm] = Field(default_factory=list)
    lang_filter: list[str] | None = None
    country_filter: list[str] | None = None

    def positive_terms(self) -> list[QueryTerm]:
        """Return non-exclusion terms."""

        return [t for t in self.terms if not t.is_exclusion]

    def exclusion_terms(self) -> list[QueryTerm]:
        """Return exclusion terms."""

        return [t for t in self.terms if t.is_exclusion]


class RawDocument(BaseModel):
    """A raw item emitted by a connector, before normalisation.

    ``body_html``/``body_text`` are mutually optional: connectors provide
    whatever the source gave them (GDELT gives neither, RSS may give HTML,
    Telegram gives plain text). The pipeline decides what — if anything — is
    persisted, honouring ``sources.allows_fulltext_storage``.
    """

    model_config = ConfigDict(extra="forbid")

    source_domain: str
    url: str
    external_id: str | None = None
    title: str | None = None
    body_html: str | None = None
    body_text: str | None = None
    summary: str | None = None
    lang: str | None = None
    published_at: dt.datetime | None = None
    author: str | None = None
    media_type: MediaType = MediaType.article
    engagement: dict[str, Any] | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class HealthStatus(BaseModel):
    """Result of a connector ``health_check``."""

    healthy: bool
    detail: str | None = None


class BaseConnector(abc.ABC):
    """Abstract base class for all connectors.

    Subclasses set the class attributes and implement :meth:`fetch` and
    :meth:`health_check`. ``required_env`` names the ``Settings`` fields that must
    be non-empty for the connector to be enabled (see ``registry``).
    """

    name: str
    source_type: SourceType
    default_interval_seconds: int
    required_env: tuple[str, ...] = ()

    @abc.abstractmethod
    def fetch(self, query: WatchlistQuery, since: dt.datetime) -> AsyncIterator[RawDocument]:
        """Yield raw documents matching ``query`` published on or after ``since``.

        Implemented as an ``async def`` generator; declared here as a regular
        method returning an async iterator so subclasses may use ``yield``.
        """
        raise NotImplementedError

    @abc.abstractmethod
    async def health_check(self) -> HealthStatus:
        """Return whether the connector can currently reach its source."""
        raise NotImplementedError

    async def aclose(self) -> None:
        """Release any resources (HTTP client, session). Default: no-op."""
        return None
