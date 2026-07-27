"""API-source scope: merge enabled rows and fold into GDELT/Perigon queries."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.api_sources import (
    ApiSourceScope,
    apply_scope_to_perigon_params,
    build_gdelt_query_with_scope,
    load_api_source_scope,
)
from newsradar.connectors.base import QueryTerm, WatchlistQuery
from newsradar.db.models import ApiSource


def _query() -> WatchlistQuery:
    return WatchlistQuery(
        watchlist_id=uuid.uuid4(),
        name="demo",
        terms=[QueryTerm(text="climate"), QueryTerm(text="energy")],
    )


def test_gdelt_scope_folding() -> None:
    scope = ApiSourceScope(country_filter=["BR", "US"], lang_filter=["en"])
    q = build_gdelt_query_with_scope(_query(), scope)
    assert "sourcecountry:BR" in q and "sourcecountry:US" in q
    assert "sourcelang:en" in q
    assert "climate" in q and "OR" in q


def test_perigon_scope_folding() -> None:
    scope = ApiSourceScope(
        country_filter=["UA", "PL"], lang_filter=["uk"], extra_params={"showReprints": False}
    )
    params = apply_scope_to_perigon_params({"q": "war", "size": "100"}, scope)
    assert params["country"] == "UA,PL"
    assert params["language"] == "uk"
    assert params["showReprints"] == "False"
    assert params["q"] == "war"  # untouched


@pytest.mark.asyncio
async def test_load_scope_merges_enabled_rows(session: AsyncSession) -> None:
    await session.execute(text("TRUNCATE api_sources CASCADE"))
    session.add_all(
        [
            ApiSource(
                provider="gdelt",
                name="latam",
                enabled=True,
                country_filter=["BR", "AR"],
                lang_filter=["es"],
                extra_params={"a": 1},
            ),
            ApiSource(
                provider="gdelt",
                name="europe",
                enabled=True,
                country_filter=["BR", "FR"],
                lang_filter=["fr"],
                extra_params={"b": 2},
            ),
            ApiSource(
                provider="gdelt", name="disabled", enabled=False, country_filter=["ZZ"]
            ),
            ApiSource(provider="perigon", name="other", enabled=True, country_filter=["US"]),
        ]
    )
    await session.commit()

    scope = await load_api_source_scope(session, "gdelt")
    assert scope.country_filter == ["BR", "AR", "FR"]  # union, first-seen order, deduped
    assert scope.lang_filter == ["es", "fr"]
    assert scope.extra_params == {"a": 1, "b": 2}
    assert "ZZ" not in scope.country_filter  # disabled row excluded
