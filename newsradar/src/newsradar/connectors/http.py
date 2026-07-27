"""Shared ``httpx.AsyncClient`` factory for HTTP-based connectors."""

from __future__ import annotations

import httpx

from newsradar.config import Settings

DEFAULT_TIMEOUT = httpx.Timeout(30.0)


def make_client(settings: Settings, **kwargs: object) -> httpx.AsyncClient:
    """Return an ``AsyncClient`` with a descriptive User-Agent and 30s timeout."""

    headers = {"User-Agent": settings.connector_user_agent}
    return httpx.AsyncClient(
        headers=headers,
        timeout=DEFAULT_TIMEOUT,
        follow_redirects=True,
        **kwargs,  # type: ignore[arg-type]
    )
