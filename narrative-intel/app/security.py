"""Public-API guards: optional API-key auth + simple in-memory rate limiting.

Both are no-ops until configured: if API_KEYS is empty the API is open; the rate
limiter uses a generous default. Suitable for an MVP / single instance.
"""
from __future__ import annotations

import time

from fastapi import Header, HTTPException, Request

from .config import settings

RATE_LIMIT = 120        # requests
RATE_WINDOW = 60        # seconds

_buckets: dict[str, list[float]] = {}


def _api_keys() -> set[str]:
    return {k.strip() for k in settings.api_keys.split(",") if k.strip()}


async def api_key_auth(x_api_key: str | None = Header(default=None)) -> None:
    keys = _api_keys()
    if not keys:
        return  # open API
    if x_api_key not in keys:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


async def rate_limit(request: Request, x_api_key: str | None = Header(default=None)) -> None:
    ident = x_api_key or (request.client.host if request.client else "anon")
    now = time.time()
    hits = [t for t in _buckets.get(ident, []) if now - t < RATE_WINDOW]
    if len(hits) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    hits.append(now)
    _buckets[ident] = hits
