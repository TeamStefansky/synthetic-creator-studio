"""API-source query scopes for global providers (GDELT / Perigon).

An ``api_sources`` row lets the user pull from a global provider scoped to chosen
countries/languages without subscribing to individual outlets. The connectors
read these rows (in addition to the watchlist terms) and fold their country /
language / extra-param scope into the provider query.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.base import WatchlistQuery
from newsradar.connectors.gdelt import build_gdelt_query
from newsradar.db.models import ApiSource


@dataclass(slots=True)
class ApiSourceScope:
    """The merged scope of every enabled ``api_sources`` row for one provider."""

    country_filter: list[str] = field(default_factory=list)
    lang_filter: list[str] = field(default_factory=list)
    extra_params: dict[str, Any] = field(default_factory=dict)

    @property
    def empty(self) -> bool:
        return not (self.country_filter or self.lang_filter or self.extra_params)


async def load_api_source_scope(session: AsyncSession, provider: str) -> ApiSourceScope:
    """Merge all enabled ``api_sources`` rows for ``provider`` into one scope."""

    rows = (
        (
            await session.execute(
                select(ApiSource).where(ApiSource.provider == provider, ApiSource.enabled.is_(True))
            )
        )
        .scalars()
        .all()
    )
    countries: list[str] = []
    langs: list[str] = []
    extra: dict[str, Any] = {}
    for row in rows:
        for cc in row.country_filter or []:
            if cc not in countries:
                countries.append(cc)
        for lang in row.lang_filter or []:
            if lang not in langs:
                langs.append(lang)
        if row.extra_params:
            extra.update(row.extra_params)
    return ApiSourceScope(country_filter=countries, lang_filter=langs, extra_params=extra)


def build_gdelt_query_with_scope(query: WatchlistQuery, scope: ApiSourceScope) -> str:
    """Fold a scope's country/language filters into a GDELT DOC query string.

    Countries become an OR group of ``sourcecountry:`` clauses; languages an OR
    group of ``sourcelang:`` clauses (best-effort — GDELT uses its own country
    codes, so this narrows rather than guarantees).
    """

    clause = build_gdelt_query(query)
    if scope.country_filter:
        countries = " OR ".join(f"sourcecountry:{cc}" for cc in scope.country_filter)
        clause = (
            f"{clause} ({countries})" if len(scope.country_filter) > 1 else f"{clause} {countries}"
        )
    if scope.lang_filter:
        langs = " OR ".join(f"sourcelang:{lang}" for lang in scope.lang_filter)
        clause = f"{clause} ({langs})" if len(scope.lang_filter) > 1 else f"{clause} {langs}"
    return clause


def apply_scope_to_perigon_params(params: dict[str, str], scope: ApiSourceScope) -> dict[str, str]:
    """Return a copy of Perigon request ``params`` with the scope applied.

    Perigon accepts ISO 3166-1 alpha-2 ``country`` and ISO 639-1 ``language``
    (comma-joined). ``extra_params`` are stringified and merged last.
    """

    merged = dict(params)
    if scope.country_filter:
        merged["country"] = ",".join(scope.country_filter)
    if scope.lang_filter and "language" not in merged:
        merged["language"] = ",".join(scope.lang_filter)
    for key, value in scope.extra_params.items():
        merged[key] = str(value)
    return merged
