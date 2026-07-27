"""Connector base contracts, the FakeConnector, and the registry."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest

from newsradar.config import Settings
from newsradar.connectors.base import BaseConnector, RawDocument, WatchlistQuery
from newsradar.connectors.fake import FakeConnector
from newsradar.connectors.gdelt import GdeltConnector
from newsradar.connectors.perigon import PerigonConnector
from newsradar.connectors.registry import (
    get_connector_by_name,
    get_enabled_connectors,
    is_enabled,
)
from newsradar.connectors.rss import RssConnector
from newsradar.connectors.telegram import TelegramConnector
from newsradar.connectors.youtube import YouTubeConnector


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def test_base_connector_is_abstract() -> None:
    with pytest.raises(TypeError):
        BaseConnector()  # type: ignore[abstract]


def test_raw_document_defaults() -> None:
    doc = RawDocument(source_domain="reuters.com", url="https://reuters.com/a")
    assert doc.media_type == "article"
    assert doc.raw == {}


def test_watchlist_query_positive_and_exclusion_split() -> None:
    query = WatchlistQuery(
        watchlist_id=uuid.uuid4(),
        name="demo",
        terms=[
            {"text": "cyber", "is_exclusion": False},  # type: ignore[list-item]
            {"text": "sport", "is_exclusion": True},  # type: ignore[list-item]
        ],
    )
    assert [t.text for t in query.positive_terms()] == ["cyber"]
    assert [t.text for t in query.exclusion_terms()] == ["sport"]


@pytest.mark.asyncio
async def test_fake_connector_yields_documents() -> None:
    docs = [
        RawDocument(source_domain="a.com", url="https://a.com/1"),
        RawDocument(source_domain="a.com", url="https://a.com/2"),
    ]
    fake = FakeConnector(documents=docs)
    query = WatchlistQuery(watchlist_id=uuid.uuid4(), name="demo")
    out = [d async for d in fake.fetch(query, dt.datetime(2020, 1, 1, tzinfo=dt.UTC))]
    assert [d.url for d in out] == ["https://a.com/1", "https://a.com/2"]
    assert (await fake.health_check()).healthy is True


@pytest.mark.asyncio
async def test_fake_connector_can_raise() -> None:
    from newsradar.connectors.base import ConnectorError

    fake = FakeConnector(raise_on_fetch=True)
    query = WatchlistQuery(watchlist_id=uuid.uuid4(), name="demo")
    with pytest.raises(ConnectorError):
        [d async for d in fake.fetch(query, dt.datetime(2020, 1, 1, tzinfo=dt.UTC))]


def test_registry_enables_only_configured_connectors() -> None:
    bare = _settings()
    assert is_enabled(GdeltConnector, bare) is True
    assert is_enabled(RssConnector, bare) is True
    assert is_enabled(TelegramConnector, bare) is False
    assert is_enabled(YouTubeConnector, bare) is False
    # Perigon requires a key; disabled without one even though PERIGON_ENABLED defaults true.
    assert is_enabled(PerigonConnector, bare) is False

    names = {c.name for c in get_enabled_connectors(bare)}
    assert names == {"gdelt", "rss"}


def test_registry_enables_credentialed_connectors() -> None:
    full = _settings(
        telegram_api_id="12345",
        telegram_api_hash="hash",
        telegram_session="sess",
        youtube_api_key="yt",
        perigon_api_key="pg",
    )
    names = {c.name for c in get_enabled_connectors(full)}
    assert names == {"gdelt", "rss", "telegram", "youtube", "perigon"}


def test_registry_perigon_feature_flag() -> None:
    disabled = _settings(perigon_api_key="pg", perigon_enabled=False)
    assert is_enabled(PerigonConnector, disabled) is False


def test_get_connector_by_name() -> None:
    bare = _settings()
    assert get_connector_by_name("gdelt", bare).name == "gdelt"  # type: ignore[union-attr]
    assert get_connector_by_name("nope", bare) is None
